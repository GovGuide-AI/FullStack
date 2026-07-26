import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRouterSchema,
  MAX_CANDIDATES,
  NEEDS_CLARIFICATION,
  NO_MATCH,
} from '@/lib/ai/schemas';

const generateText = vi.hoisted(() => vi.fn());
const readCachedPayload = vi.hoisted(() => vi.fn());

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText,
}));

vi.mock('@/lib/env', () => ({
  getEnv: () => ({
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_ROUTER_MODEL: 'test/router',
    OPENROUTER_ANSWER_MODEL: 'test/answer',
  }),
  hasDatabase: () => false,
}));

vi.mock('@/lib/ai/provider', () => ({
  getRouterModel: () => 'router-model',
  getAnswerModel: () => 'answer-model',
  getSummaryModel: () => 'summary-model',
  DETERMINISTIC_DECODING: { temperature: 0, seed: 7 },
}));

// Keeps the suite independent of whether a database happens to be configured.
vi.mock('@/repositories/ai-cache.repository', () => ({
  readCachedPayload,
  writeCachedPayload: vi.fn().mockResolvedValue(true),
}));

const { askGuidance } = await import('@/services/guidance.service');
const { AiUnavailableError } = await import('@/lib/ai/errors');

/** The template record, which is unverified and so exercises suppression. */
const SLUG = 'example-service-template';

function routerReturns(serviceSlug: string, clarifyingQuestion = '', candidates: string[] = []) {
  generateText.mockResolvedValueOnce({ output: { serviceSlug, clarifyingQuestion, candidates } });
}

function explainerReturns(explanation: string, citations: string[]) {
  generateText.mockResolvedValueOnce({ output: { explanation, citations } });
}

describe('askGuidance', () => {
  beforeEach(() => {
    generateText.mockReset();
    readCachedPayload.mockReset().mockResolvedValue(null);
  });

  it('returns not-covered without ever calling the answer model', async () => {
    routerReturns(NO_MATCH);

    const result = await askGuidance({ question: 'how do I adopt a dragon', locale: 'en' });

    expect(result).toEqual({ kind: 'not-covered', suggestions: [] });
    // The single call is the router. Spending a second model call to apologise
    // for not knowing something would be pure waste.
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('asks for clarification without calling the answer model', async () => {
    routerReturns(NEEDS_CLARIFICATION, 'Do you mean a new licence or a renewal?');

    const result = await askGuidance({ question: 'licence', locale: 'en' });

    expect(result).toEqual({
      kind: 'clarify',
      question: 'Do you mean a new licence or a renewal?',
      options: [],
    });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('routes using the answer to a clarifying question', async () => {
    routerReturns(SLUG);
    explainerReturns('Template.', ['summary']);

    const result = await askGuidance({
      question: 'passport',
      locale: 'en',
      clarification: { question: 'New or renewal?', answer: 'a brand new one' },
    });

    expect(result.kind).toBe('answer');

    // The reply has to reach the model, otherwise the second pass is identical
    // to the first and the user is asked the same thing again.
    const routerArgs = generateText.mock.calls[0]?.[0];
    expect(routerArgs.prompt).toContain('a brand new one');
    // The second pass must be told it cannot ask again, or the user loops.
    expect(routerArgs.system).toContain('already answered one clarifying question');
  });

  it('never asks a second clarifying question', async () => {
    routerReturns(NEEDS_CLARIFICATION, 'Which one did you mean?');

    const result = await askGuidance({
      question: 'passport',
      locale: 'en',
      clarification: { question: 'New or renewal?', answer: 'not sure' },
    });

    // Asking again would be a loop with no exit, so an unresolved second pass
    // is reported honestly instead.
    expect(result).toEqual({ kind: 'not-covered', suggestions: [] });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('treats a clarification with no question as not-covered', async () => {
    routerReturns(NEEDS_CLARIFICATION, '   ');

    const result = await askGuidance({ question: 'something vague', locale: 'en' });

    expect(result).toEqual({ kind: 'not-covered', suggestions: [] });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('returns a grounded answer when every citation resolves', async () => {
    routerReturns(SLUG);
    explainerReturns('This is a template record.', ['summary', 'documents.0']);

    const result = await askGuidance({ question: 'tell me about the example', locale: 'en' });

    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;

    expect(result.grounded).toBe(true);
    expect(result.explanation).toBe('This is a template record.');
    expect(result.citations.map((c) => c.id)).toEqual(['summary', 'documents.0']);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('rejects the explanation when a citation does not resolve', async () => {
    routerReturns(SLUG);
    explainerReturns('The fee is 500 birr.', ['fees.99']);

    const result = await askGuidance({ question: 'what does it cost', locale: 'en' });

    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;

    // The fabricated prose must not reach the user, even though the model
    // supplied something that looks like a citation.
    expect(result.grounded).toBe(false);
    expect(result.explanation).toBeNull();
    expect(result.citations).toEqual([]);
  });

  it('rejects prose that cites nothing at all', async () => {
    routerReturns(SLUG);
    explainerReturns('Generally you need two photos and a birth certificate.', []);

    const result = await askGuidance({ question: 'what do I bring', locale: 'en' });

    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;

    expect(result.grounded).toBe(false);
    expect(result.explanation).toBeNull();
  });

  it('still returns the verified record when the answer model fails', async () => {
    routerReturns(SLUG);
    generateText.mockRejectedValueOnce(new Error('upstream 500'));

    const result = await askGuidance({ question: 'tell me about the example', locale: 'en' });

    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;

    // Degraded, not failed: the checklist is the part that matters.
    expect(result.explanation).toBeNull();
    expect(result.grounded).toBe(false);
    expect(result.service.slug).toBe(SLUG);
  });

  it('propagates a routing failure as AiUnavailableError', async () => {
    generateText.mockRejectedValueOnce(new Error('upstream 500'));

    await expect(askGuidance({ question: 'anything', locale: 'en' })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it('propagates a routing timeout as AiUnavailableError', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    generateText.mockRejectedValueOnce(timeout);

    await expect(askGuidance({ question: 'anything', locale: 'en' })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it('degrades rather than failing when the answer model times out', async () => {
    routerReturns(SLUG);
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    generateText.mockRejectedValueOnce(timeout);

    const result = await askGuidance({ question: 'tell me about the example', locale: 'en' });

    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;
    expect(result.explanation).toBeNull();
    expect(result.service.documents.length).toBeGreaterThan(0);
  });

  it('suppresses fees and offices for an unverified record', async () => {
    routerReturns(SLUG);
    explainerReturns('Template.', ['summary']);

    const result = await askGuidance({ question: 'example', locale: 'en' });

    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') return;

    // The seeded record is unverified, so these must never be serialized.
    expect(result.service.verified).toBe(false);
    expect(result.service.fees).toBeNull();
    expect(result.service.offices).toBeNull();
  });
});

describe('buildRouterSchema candidates', () => {
  const schema = buildRouterSchema(['new-passport', 'passport-renewal']);
  const base = { serviceSlug: NO_MATCH, clarifyingQuestion: '' };

  it('accepts real slugs', () => {
    expect(schema.safeParse({ ...base, candidates: ['new-passport'] }).success).toBe(true);
  });

  it('accepts an empty list, which is how a plain refusal is expressed', () => {
    expect(schema.safeParse({ ...base, candidates: [] }).success).toBe(true);
  });

  it('rejects a slug that is not in the catalog', () => {
    // The enum is the guard: a model cannot suggest a service that does not exist.
    expect(schema.safeParse({ ...base, candidates: ['invented-service'] }).success).toBe(false);
  });

  it('rejects the sentinels', () => {
    expect(schema.safeParse({ ...base, candidates: [NEEDS_CLARIFICATION] }).success).toBe(false);
  });

  it('caps the list', () => {
    const tooMany = Array.from({ length: MAX_CANDIDATES + 1 }, () => 'new-passport');
    expect(schema.safeParse({ ...base, candidates: tooMany }).success).toBe(false);
  });
});

describe('askGuidance near misses', () => {
  beforeEach(() => {
    generateText.mockReset();
    readCachedPayload.mockReset().mockResolvedValue(null);
  });

  it('offers the nearest records when nothing plainly matches', async () => {
    routerReturns(NO_MATCH, '', ['fayda-lost-number', 'fayda-update-details']);

    const result = await askGuidance({ question: 'how do I enrol for Fayda', locale: 'en' });

    expect(result.kind).toBe('not-covered');
    if (result.kind !== 'not-covered') return;

    // A dead end with two obviously related records sitting right there was the
    // whole reason this exists.
    expect(result.suggestions.map((s) => s.slug)).toEqual([
      'fayda-lost-number',
      'fayda-update-details',
    ]);
    expect(result.suggestions[0]?.category).toBe('identity');
  });

  it('attaches the near misses to a clarifying question as options', async () => {
    routerReturns(NEEDS_CLARIFICATION, 'Which Fayda problem do you have?', ['fayda-lost-number']);

    const result = await askGuidance({ question: 'fayda id', locale: 'en' });

    expect(result.kind).toBe('clarify');
    if (result.kind !== 'clarify') return;
    expect(result.options.map((o) => o.slug)).toEqual(['fayda-lost-number']);
  });

  it('carries the near misses through an unresolved second pass', async () => {
    routerReturns(NEEDS_CLARIFICATION, 'Still not sure which one?', ['fayda-update-details']);

    const result = await askGuidance({
      question: 'fayda',
      locale: 'en',
      clarification: { question: 'Lost or wrong details?', answer: 'neither' },
    });

    expect(result.kind).toBe('not-covered');
    if (result.kind !== 'not-covered') return;
    expect(result.suggestions.map((s) => s.slug)).toEqual(['fayda-update-details']);
  });

  it('titles suggestions in the requested locale', async () => {
    routerReturns(NO_MATCH, '', ['fayda-lost-number']);

    const result = await askGuidance({ question: 'ፋይዳ', locale: 'am' });

    expect(result.kind).toBe('not-covered');
    if (result.kind !== 'not-covered') return;

    const title = result.suggestions[0]?.title ?? '';
    expect(title).not.toBe('');
    // Amharic is written in Ethiopic; an English title here means the locale was
    // dropped somewhere between the router and the response.
    expect(title).toMatch(/[\u1200-\u137F]/);
  });

  it('drops candidates that no longer resolve', async () => {
    // A cached route can outlive the record it names. The rest of the list is
    // still useful, so a stale slug is skipped rather than failing the response.
    readCachedPayload.mockResolvedValue({
      serviceSlug: NO_MATCH,
      clarifyingQuestion: '',
      candidates: ['fayda-lost-number', 'a-record-we-deleted', 'fayda-lost-number'],
    });

    const result = await askGuidance({ question: 'fayda', locale: 'en' });

    expect(result.kind).toBe('not-covered');
    if (result.kind !== 'not-covered') return;
    expect(result.suggestions.map((s) => s.slug)).toEqual(['fayda-lost-number']);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('reuses a cached route written before candidates existed', async () => {
    readCachedPayload.mockResolvedValue({ serviceSlug: NO_MATCH, clarifyingQuestion: '' });

    const result = await askGuidance({ question: 'how do I adopt a dragon', locale: 'en' });

    // Rejecting these would throw away a day of cached routing for no gain.
    expect(result).toEqual({ kind: 'not-covered', suggestions: [] });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('re-routes when a cached payload is not a routing result at all', async () => {
    readCachedPayload.mockResolvedValue({ something: 'else' });
    routerReturns(NO_MATCH);

    const result = await askGuidance({ question: 'anything', locale: 'en' });

    expect(result).toEqual({ kind: 'not-covered', suggestions: [] });
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});
