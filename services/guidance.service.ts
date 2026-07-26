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
  type RouterDecision,
} from '@/lib/ai/schemas';
import type { AskResponse, Clarification, ServiceSuggestion } from '@/lib/ask/contract';
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
 * Routing spends 14-57s on the free tier, and the spread is queue latency, not
 * question difficulty: throughput measured 8-23 tokens/second for the same 300-
 * 500 token response. 45s catches the bulk of that distribution and abandons
 * the outliers rather than making someone watch a skeleton for a minute; the
 * route cache means a question only pays this once.
 *
 * Every provider-side lever was measured and none of them helps, so please do
 * not re-run this experiment:
 *
 * - `reasoning: { effort: 'none' }` is accepted and then ignored — 276-889
 *   reasoning tokens still came back. `openai/gpt-oss-20b:free` rejects it with
 *   "Reasoning is mandatory for this endpoint and cannot be disabled".
 * - `reasoning: { max_tokens: n }` is honoured as a ceiling near 512 but ignored
 *   at 128, and the tighter cap started costing decisions.
 * - `provider: { sort: 'throughput' }` made it worse, at 8 tokens/second.
 * - Every free model advertising `structured_outputs` is a reasoning model, and
 *   the fast one (`gpt-oss-20b`, 4-6s) cannot emit output this schema parses.
 *
 * What would actually fix it is a paid model, or not calling the model at all
 * for questions a deterministic alias match already settles.
 */
const ROUTER_TIMEOUT = { stepMs: 45_000, totalMs: 90_000 } as const;
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
    return { kind: 'not-covered', suggestions: [] };
  }

  const decision = await routeQuestion(request, slugs);
  const suggestions = resolveSuggestions(decision.candidates, request.locale);

  // Only one round of clarification is offered. If the model still cannot place
  // the question after the user has already answered once, saying so is kinder
  // than asking again and leaving them in a loop with no way out. The near
  // misses still go out, so the user has somewhere to go either way.
  if (decision.serviceSlug === NEEDS_CLARIFICATION && decision.clarifyingQuestion.trim()) {
    return request.clarification
      ? { kind: 'not-covered', suggestions }
      : { kind: 'clarify', question: decision.clarifyingQuestion.trim(), options: suggestions };
  }

  // Anything that is not a real slug — including a clarification with no
  // question attached — is treated as "we don't know". The answer model is
  // never called, so a miss costs one request instead of two.
  const service = getKnowledgeBase().bySlug.get(decision.serviceSlug);
  if (!service) {
    return { kind: 'not-covered', suggestions };
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

/**
 * Turns the router's candidate slugs into something linkable.
 *
 * Slugs that no longer resolve are dropped rather than treated as an error: a
 * cached routing result outlives a knowledge base edit that removes a record,
 * and a missing suggestion is a smaller loss than a broken link.
 */
function resolveSuggestions(
  candidates: readonly string[],
  locale: Locale,
): readonly ServiceSuggestion[] {
  const { bySlug } = getKnowledgeBase();
  const seen = new Set<string>();

  return candidates.flatMap((slug) => {
    if (seen.has(slug)) return [];
    seen.add(slug);

    const service = bySlug.get(slug);
    if (!service) return [];

    return [{ slug: service.slug, title: service.title[locale], category: service.category }];
  });
}

async function routeQuestion(
  request: GuidanceRequest,
  slugs: readonly string[],
): Promise<RouterDecision> {
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
  const cachedDecision = toRouterDecision(cached);
  if (cachedDecision) {
    return cachedDecision;
  }

  const { system, prompt } = buildRouterPrompt({
    question: request.question,
    locale: request.locale,
    catalog: renderCatalogForPrompt(),
    clarification: request.clarification,
  });

  let decision: RouterDecision;
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

/**
 * Reads a cached routing result, or `null` if the payload is not one.
 *
 * `candidates` is filled in when absent instead of rejecting the entry, so the
 * day this field shipped did not throw away a day's worth of cached routes.
 */
function toRouterDecision(value: unknown): RouterDecision | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  if (typeof record.serviceSlug !== 'string' || typeof record.clarifyingQuestion !== 'string') {
    return null;
  }

  const candidates = Array.isArray(record.candidates)
    ? record.candidates.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    serviceSlug: record.serviceSlug,
    clarifyingQuestion: record.clarifyingQuestion,
    candidates,
  };
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
