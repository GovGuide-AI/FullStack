import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiUnavailableError } from '@/lib/ai/errors';
import type { AskResponse } from '@/lib/ask/contract';
import { createSessionId, SESSION_COOKIE_NAME } from '@/lib/session';

const askGuidance = vi.hoisted(() => vi.fn());
const ensureSession = vi.hoisted(() => vi.fn());
const recordExchange = vi.hoisted(() => vi.fn());

vi.mock('@/services/guidance.service', () => ({ askGuidance }));
vi.mock('@/repositories/session.repository', () => ({ ensureSession }));
vi.mock('@/repositories/message.repository', () => ({ recordExchange }));

const { POST } = await import('@/app/api/ask/route');

const NOT_COVERED: AskResponse = { kind: 'not-covered' };

/**
 * Rate limiting is keyed by session, so every test that does not care about it
 * uses a fresh session id and stays well under the window.
 */
function post(body: unknown, options: { sessionId?: string; raw?: string } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.sessionId) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${options.sessionId}`);
  }

  return POST(
    new Request('https://govguide.example/api/ask', {
      method: 'POST',
      headers,
      body: options.raw ?? JSON.stringify(body),
    }),
  );
}

describe('POST /api/ask', () => {
  beforeEach(() => {
    askGuidance.mockReset().mockResolvedValue(NOT_COVERED);
    ensureSession.mockReset().mockResolvedValue(false);
    recordExchange.mockReset().mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await post(null, { raw: 'not json at all' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid-request' });
    expect(askGuidance).not.toHaveBeenCalled();
  });

  it('rejects an empty question', async () => {
    const response = await post({ question: '   ', locale: 'en' });

    expect(response.status).toBe(400);
    expect(askGuidance).not.toHaveBeenCalled();
  });

  it('rejects a question beyond the length limit', async () => {
    const response = await post({ question: 'x'.repeat(501), locale: 'en' });

    expect(response.status).toBe(400);
    expect(askGuidance).not.toHaveBeenCalled();
  });

  it('rejects an unsupported locale', async () => {
    const response = await post({ question: 'how do I renew my passport', locale: 'fr' });

    expect(response.status).toBe(400);
    expect(askGuidance).not.toHaveBeenCalled();
  });

  it('answers a valid question and mints a session cookie', async () => {
    const response = await post({ question: 'how do I renew my passport', locale: 'am' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(NOT_COVERED);
    expect(askGuidance).toHaveBeenCalledWith({
      question: 'how do I renew my passport',
      locale: 'am',
    });
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps an existing session rather than issuing a new one', async () => {
    const sessionId = createSessionId();

    const response = await post({ question: 'passport renewal', locale: 'en' }, { sessionId });

    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('replaces a malformed session cookie', async () => {
    const response = await post(
      { question: 'passport renewal', locale: 'en' },
      { sessionId: 'not-a-uuid' },
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 503 when the router model is unavailable', async () => {
    askGuidance.mockRejectedValue(new AiUnavailableError(new Error('upstream 500')));

    const response = await post({ question: 'passport renewal', locale: 'en' });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'unavailable' });
  });

  it('returns 503 rather than leaking an unexpected failure', async () => {
    askGuidance.mockRejectedValue(new Error('something else broke'));

    const response = await post({ question: 'passport renewal', locale: 'en' });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'unavailable' });
  });

  it('still answers when persistence fails', async () => {
    ensureSession.mockRejectedValue(new Error('database down'));

    const response = await post({ question: 'passport renewal', locale: 'en' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(NOT_COVERED);
  });

  it('rate-limits a session and advertises when to retry', async () => {
    const sessionId = createSessionId();
    const question = { question: 'passport renewal', locale: 'en' };

    for (let i = 0; i < 12; i += 1) {
      const allowed = await post(question, { sessionId });
      expect(allowed.status).toBe(200);
    }

    const blocked = await post(question, { sessionId });

    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toEqual({ error: 'rate-limited' });
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
