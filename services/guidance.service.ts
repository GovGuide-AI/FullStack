import 'server-only';
import { generateText, Output } from 'ai';
import { AiUnavailableError } from '@/lib/ai/errors';
import { buildExplanationPrompt, buildRouterPrompt } from '@/lib/ai/prompts';
import { DETERMINISTIC_DECODING, getAnswerModel, getRouterModel } from '@/lib/ai/provider';
import {
  buildRouterSchema,
  explanationSchema,
  NEEDS_CLARIFICATION,
  NO_MATCH,
} from '@/lib/ai/schemas';
import type { AskResponse, Clarification } from '@/lib/ask/contract';
import { getEnv } from '@/lib/env';
import { getCatalogSlugs, renderCatalogForPrompt } from '@/lib/knowledge/catalog';
import { listCitations, partitionCitations } from '@/lib/knowledge/citations';
import { buildCacheKey, hashCatalog, hashService } from '@/lib/knowledge/hash';
import { getKnowledgeBase } from '@/lib/knowledge/loader';
import { toServiceView } from '@/lib/knowledge/view';
import type { Locale } from '@/lib/locales';
import { readCachedPayload, writeCachedPayload } from '@/repositories/ai-cache.repository';

/** Routing is cheap to redo and the catalog changes on deploy, so a day is plenty. */
const ROUTE_CACHE_TTL_SECONDS = 60 * 60 * 24;
const EXPLAIN_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * A bare `timeout` number is a *total* budget spanning every retry, which made
 * the previous 15s-with-2-retries pairing self-defeating: one slow attempt ate
 * the whole allowance and the retries had no time left to run. Splitting it
 * gives each attempt its own window and leaves room for a genuine retry.
 *
 * The step budgets are sized against measured latency rather than guessed.
 * Routing on a free-tier reasoning model takes 10-12s, so 20s per attempt is
 * roughly 70% headroom; anything slower is a stall worth abandoning.
 */
const ROUTER_TIMEOUT = { stepMs: 20_000, totalMs: 45_000 } as const;
const ANSWER_TIMEOUT = { stepMs: 30_000, totalMs: 50_000 } as const;

export interface GuidanceRequest {
  readonly question: string;
  readonly locale: Locale;
  /** A prior round of clarification, replayed by the client. */
  readonly clarification?: Clarification | null;
}

export async function askGuidance(request: GuidanceRequest): Promise<AskResponse> {
  const slugs = getCatalogSlugs();

  // Nothing to match against. Skip the model entirely.
  if (slugs.length === 0) {
    return { kind: 'not-covered' };
  }

  const decision = await routeQuestion(request, slugs);

  // Only one round of clarification is offered. If the model still cannot place
  // the question after the user has already answered once, saying so is kinder
  // than asking again and leaving them in a loop with no way out.
  if (decision.serviceSlug === NEEDS_CLARIFICATION && decision.clarifyingQuestion.trim()) {
    return request.clarification
      ? { kind: 'not-covered' }
      : { kind: 'clarify', question: decision.clarifyingQuestion.trim() };
  }

  // Anything that is not a real slug — including a clarification with no
  // question attached — is treated as "we don't know". The answer model is
  // never called, so a miss costs one request instead of two.
  const service = getKnowledgeBase().bySlug.get(decision.serviceSlug);
  if (!service) {
    return { kind: 'not-covered' };
  }

  const view = toServiceView(service, request.locale);
  const citations = listCitations(service, request.locale);

  const explanation = await explainService({
    question: request.question,
    locale: request.locale,
    serviceTitle: view.title,
    citations,
    serviceHash: hashService(service),
  });

  if (!explanation) {
    // The explanation failed or could not be verified. The record itself is
    // still verified data worth showing, so degrade rather than error out.
    return { kind: 'answer', service: view, explanation: null, citations: [], grounded: false };
  }

  const { known, unknown } = partitionCitations(service, explanation.citations);

  // A citation that does not resolve means the model referred to something
  // outside the record. Prose with no citations at all is equally ungrounded:
  // it was written from the model's own memory, which is exactly what this
  // application must never show a user.
  if (unknown.length > 0 || known.length === 0) {
    console.warn(
      `[grounding] rejected explanation for "${service.slug}"`,
      unknown.length > 0 ? `unknown citations: ${unknown.join(', ')}` : 'no citations supplied',
    );
    return { kind: 'answer', service: view, explanation: null, citations: [], grounded: false };
  }

  const citationById = new Map(citations.map((citation) => [citation.id, citation]));

  return {
    kind: 'answer',
    service: view,
    explanation: explanation.explanation,
    citations: known.flatMap((id) => {
      const citation = citationById.get(id);
      return citation ? [citation] : [];
    }),
    grounded: true,
  };
}

async function routeQuestion(
  request: GuidanceRequest,
  slugs: readonly string[],
): Promise<{ serviceSlug: string; clarifyingQuestion: string }> {
  const env = getEnv();
  const model = env.OPENROUTER_ROUTER_MODEL;
  const cacheKey = buildCacheKey([
    'route',
    model,
    request.locale,
    hashCatalog(),
    request.question.toLowerCase(),
    // Without this, the answered follow-up would collide with the original
    // question and be served the cached "needs clarification" forever.
    request.clarification?.answer.toLowerCase() ?? '',
  ]);

  const cached = await readCachedPayload(cacheKey);
  if (isRouterPayload(cached)) {
    return cached;
  }

  const { system, prompt } = buildRouterPrompt({
    question: request.question,
    locale: request.locale,
    catalog: renderCatalogForPrompt(),
    clarification: request.clarification,
  });

  let decision: { serviceSlug: string; clarifyingQuestion: string };
  try {
    const { output } = await generateText({
      model: getRouterModel(),
      system,
      prompt,
      output: Output.object({ schema: buildRouterSchema(slugs) }),
      maxRetries: 2,
      timeout: ROUTER_TIMEOUT,
      ...DETERMINISTIC_DECODING,
    });
    decision = output;
  } catch (error) {
    throw new AiUnavailableError(error);
  }

  await writeCachedPayload({
    key: cacheKey,
    kind: 'route',
    model,
    payload: decision,
    ttlSeconds: ROUTE_CACHE_TTL_SECONDS,
  });

  return decision;
}

async function explainService(input: {
  question: string;
  locale: Locale;
  serviceTitle: string;
  citations: ReturnType<typeof listCitations>;
  serviceHash: string;
}): Promise<{ explanation: string; citations: string[] } | null> {
  const env = getEnv();
  const model = env.OPENROUTER_ANSWER_MODEL;
  const cacheKey = buildCacheKey([
    'explain',
    model,
    input.locale,
    input.serviceHash,
    input.question.toLowerCase(),
  ]);

  const cached = await readCachedPayload(cacheKey);
  if (isExplanationPayload(cached)) {
    return cached;
  }

  const { system, prompt } = buildExplanationPrompt(input);

  try {
    const { output } = await generateText({
      model: getAnswerModel(),
      system,
      prompt,
      output: Output.object({ schema: explanationSchema }),
      maxRetries: 1,
      timeout: ANSWER_TIMEOUT,
      ...DETERMINISTIC_DECODING,
    });

    await writeCachedPayload({
      key: cacheKey,
      kind: 'explain',
      model,
      payload: output,
      ttlSeconds: EXPLAIN_CACHE_TTL_SECONDS,
    });

    return output;
  } catch (error) {
    // Non-fatal: the caller falls back to showing the verified record alone.
    console.error('[guidance] explanation step failed:', error);
    return null;
  }
}

function isRouterPayload(
  value: unknown,
): value is { serviceSlug: string; clarifyingQuestion: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).serviceSlug === 'string' &&
    typeof (value as Record<string, unknown>).clarifyingQuestion === 'string'
  );
}

function isExplanationPayload(
  value: unknown,
): value is { explanation: string; citations: string[] } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.explanation === 'string' &&
    Array.isArray(record.citations) &&
    record.citations.every((item) => typeof item === 'string')
  );
}

export { NO_MATCH };
