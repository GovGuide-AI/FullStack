import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEEDS_CLARIFICATION, NO_MATCH } from '@/lib/ai/schemas';

const generateText = vi.hoisted(() => vi.fn());

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
  readCachedPayload: vi.fn().mockResolvedValue(null),
  writeCachedPayload: vi.fn().mockResolvedValue(true),
}));

const { askGuidance } = await import('@/services/guidance.service');
const { AiUnavailableError } = await import('@/lib/ai/errors');

/** The one service in the seeded knowledge base. */
const SLUG = 'example-service-template';

function routerReturns(serviceSlug: string, clarifyingQuestion = '') {
  generateText.mockResolvedValueOnce({ output: { serviceSlug, clarifyingQuestion } });
}

function explainerReturns(explanation: string, citations: string[]) {
  generateText.mockResolvedValueOnce({ output: { explanation, citations } });
}

describe('askGuidance', () => {
  beforeEach(() => {
    generateText.mockReset();
  });

  it('returns not-covered without ever calling the answer model', async () => {
    routerReturns(NO_MATCH);

    const result = await askGuidance({ question: 'how do I adopt a dragon', locale: 'en' });

    expect(result).toEqual({ kind: 'not-covered' });
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
    expect(routerArgs.system).toContain('Do not ask another');
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
    expect(result).toEqual({ kind: 'not-covered' });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('treats a clarification with no question as not-covered', async () => {
    routerReturns(NEEDS_CLARIFICATION, '   ');

    const result = await askGuidance({ question: 'something vague', locale: 'en' });

    expect(result).toEqual({ kind: 'not-covered' });
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
