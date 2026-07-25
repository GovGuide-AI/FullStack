import { describe, expect, it } from 'vitest';
import { createSessionId } from '@/lib/session';
import { readCachedPayload, writeCachedPayload } from '@/repositories/ai-cache.repository';
import { getCheckedItems, saveCheckedItems } from '@/repositories/checklist.repository';
import { submitFeedback } from '@/repositories/feedback.repository';
import { recordExchange } from '@/repositories/message.repository';
import { ensureSession } from '@/repositories/session.repository';

const hasDatabase = Boolean(process.env.DATABASE_URL);

/**
 * Runs only when a database is pointed at by DATABASE_URL. Skipped otherwise so
 * a contributor without Postgres can still run the suite.
 */
describe.skipIf(!hasDatabase)('repositories (integration)', () => {
  it('creates a session and is idempotent on repeat', async () => {
    const sessionId = createSessionId();

    await expect(ensureSession(sessionId, 'am')).resolves.toBe(true);
    await expect(ensureSession(sessionId, 'en')).resolves.toBe(true);
  });

  it('round-trips a saved checklist', async () => {
    const sessionId = createSessionId();
    await ensureSession(sessionId, 'en');

    await expect(
      saveCheckedItems(sessionId, 'example-service-template', ['documents.0', 'steps.1']),
    ).resolves.toBe(true);

    await expect(getCheckedItems(sessionId, 'example-service-template')).resolves.toEqual([
      'documents.0',
      'steps.1',
    ]);
  });

  it('overwrites rather than appending on repeat save', async () => {
    const sessionId = createSessionId();
    await ensureSession(sessionId, 'en');

    await saveCheckedItems(sessionId, 'example-service-template', ['documents.0', 'steps.1']);
    await saveCheckedItems(sessionId, 'example-service-template', ['documents.0']);

    await expect(getCheckedItems(sessionId, 'example-service-template')).resolves.toEqual([
      'documents.0',
    ]);
  });

  it('never leaks one session\u2019s checklist to another', async () => {
    const owner = createSessionId();
    const stranger = createSessionId();
    await ensureSession(owner, 'en');
    await ensureSession(stranger, 'en');

    await saveCheckedItems(owner, 'example-service-template', ['documents.0']);

    await expect(getCheckedItems(stranger, 'example-service-template')).resolves.toEqual([]);
  });

  it('records an exchange', async () => {
    const sessionId = createSessionId();
    await ensureSession(sessionId, 'en');

    await expect(
      recordExchange({
        sessionId,
        question: 'how do I do the thing',
        answer: 'not covered',
        serviceSlug: null,
        outcome: 'not-covered',
      }),
    ).resolves.toBe(true);
  });

  it('reads back a cached payload and misses on an unknown key', async () => {
    const key = 'a'.repeat(64);

    await expect(
      writeCachedPayload({
        key,
        kind: 'route',
        model: 'test/model',
        payload: { slug: 'example-service-template' },
        ttlSeconds: 60,
      }),
    ).resolves.toBe(true);

    await expect(readCachedPayload(key)).resolves.toEqual({
      slug: 'example-service-template',
    });
    await expect(readCachedPayload('b'.repeat(64))).resolves.toBeNull();
  });

  it('records feedback against a session', async () => {
    const sessionId = createSessionId();
    await ensureSession(sessionId, 'en');

    await expect(
      submitFeedback({
        sessionId,
        serviceSlug: 'example-service-template',
        rating: 1,
        comment: null,
      }),
    ).resolves.toBe(true);
  });

  it('rejects feedback from a session that does not exist', async () => {
    // The foreign key is the guard: feedback cannot be written for an id that
    // was never issued, and withDb turns the violation into a false.
    await expect(
      submitFeedback({
        sessionId: createSessionId(),
        serviceSlug: null,
        rating: -1,
        comment: null,
      }),
    ).resolves.toBe(false);
  });

  it('treats an expired entry as a miss', async () => {
    const key = 'c'.repeat(64);

    await writeCachedPayload({
      key,
      kind: 'route',
      model: 'test/model',
      payload: { slug: 'stale' },
      ttlSeconds: -60,
    });

    await expect(readCachedPayload(key)).resolves.toBeNull();
  });
});

describe.skipIf(hasDatabase)('repositories without a database', () => {
  it('degrades instead of throwing', async () => {
    const sessionId = createSessionId();

    await expect(ensureSession(sessionId, 'en')).resolves.toBe(false);
    await expect(getCheckedItems(sessionId, 'example-service-template')).resolves.toEqual([]);
    await expect(saveCheckedItems(sessionId, 'example-service-template', ['a'])).resolves.toBe(
      false,
    );
  });
});
