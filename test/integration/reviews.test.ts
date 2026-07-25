import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSessionId } from '@/lib/session';
import {
  FLAGS_TO_HIDE,
  flagReview,
  listPublishedReviews,
  submitReview,
} from '@/repositories/review.repository';
import { ensureSession } from '@/repositories/session.repository';

const hasDatabase = Boolean(process.env.DATABASE_URL);

/**
 * A slug per test, so runs do not read each other's reports. The repository is
 * deliberately slug-agnostic — services live in YAML, not in this database — so
 * a synthetic slug exercises the same code path a real one does.
 */
function isolatedSlug(): string {
  return `test-reviews-${randomUUID().slice(0, 8)}`;
}

async function newSession(): Promise<string> {
  const sessionId = createSessionId();
  await ensureSession(sessionId, 'en');
  return sessionId;
}

describe.skipIf(!hasDatabase)('review repository (integration)', () => {
  it('stores a report and reads it back', async () => {
    const slug = isolatedSlug();
    const sessionId = await newSession();

    await expect(
      submitReview({
        sessionId,
        serviceSlug: slug,
        locale: 'en',
        body: 'They asked for a document that is not on the list, so I lost a day.',
        details: { waitTime: 'full-day', outcome: 'still-trying' },
      }),
    ).resolves.toBe(true);

    const stored = await listPublishedReviews(slug);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.body).toContain('not on the list');
    expect(stored[0]?.details).toEqual({ waitTime: 'full-day', outcome: 'still-trying' });
    expect(stored[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('does not expose the author of a report', async () => {
    const slug = isolatedSlug();
    const sessionId = await newSession();

    await submitReview({
      sessionId,
      serviceSlug: slug,
      locale: 'en',
      body: 'The queue was short in the morning but the cashier closed early that day.',
      details: {},
    });

    const [stored] = await listPublishedReviews(slug);

    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty('sessionId');
  });

  it('rejects a report from a session that does not exist', async () => {
    // The foreign key is the guard, and withDb turns the violation into a false.
    await expect(
      submitReview({
        sessionId: createSessionId(),
        serviceSlug: isolatedSlug(),
        locale: 'en',
        body: 'This report should never reach the table because the session is unknown.',
        details: {},
      }),
    ).resolves.toBe(false);
  });

  it('keeps reports scoped to their own service', async () => {
    const mine = isolatedSlug();
    const other = isolatedSlug();
    const sessionId = await newSession();

    await submitReview({
      sessionId,
      serviceSlug: mine,
      locale: 'en',
      body: 'This report belongs to one service and must not appear under another.',
      details: {},
    });

    await expect(listPublishedReviews(other)).resolves.toEqual([]);
  });

  it('returns the newest report first', async () => {
    const slug = isolatedSlug();
    const sessionId = await newSession();

    await submitReview({
      sessionId,
      serviceSlug: slug,
      locale: 'en',
      body: 'First report, written before the second one was submitted at all.',
      details: {},
    });
    await submitReview({
      sessionId,
      serviceSlug: slug,
      locale: 'am',
      body: 'Second report, which should be the one listed above the first.',
      details: {},
    });

    const stored = await listPublishedReviews(slug);

    expect(stored).toHaveLength(2);
    expect(stored[0]?.body).toContain('Second report');
  });

  it('counts one flag per visitor however many times they press it', async () => {
    const slug = isolatedSlug();
    const author = await newSession();
    const objector = await newSession();

    await submitReview({
      sessionId: author,
      serviceSlug: slug,
      locale: 'en',
      body: 'A single objector must not be able to bury a report on their own.',
      details: {},
    });

    const [stored] = await listPublishedReviews(slug);
    expect(stored).toBeDefined();
    const reviewId = stored!.id;

    for (let attempt = 0; attempt < FLAGS_TO_HIDE + 2; attempt += 1) {
      await expect(flagReview(reviewId, objector)).resolves.toBe(true);
    }

    await expect(listPublishedReviews(slug)).resolves.toHaveLength(1);
  });

  it('hides a report once enough separate visitors flag it', async () => {
    const slug = isolatedSlug();
    const author = await newSession();

    await submitReview({
      sessionId: author,
      serviceSlug: slug,
      locale: 'en',
      body: 'This report will be flagged by enough people to be taken off the page.',
      details: {},
    });

    const [stored] = await listPublishedReviews(slug);
    expect(stored).toBeDefined();
    const reviewId = stored!.id;

    for (let flagged = 1; flagged <= FLAGS_TO_HIDE; flagged += 1) {
      const objector = await newSession();
      await expect(flagReview(reviewId, objector)).resolves.toBe(true);

      const visible = await listPublishedReviews(slug);
      expect(visible).toHaveLength(flagged < FLAGS_TO_HIDE ? 1 : 0);
    }
  });

  it('reports failure when flagging something that is not there', async () => {
    const objector = await newSession();

    await expect(flagReview(randomUUID(), objector)).resolves.toBe(false);
  });
});

describe.skipIf(hasDatabase)('review repository without a database', () => {
  it('degrades instead of throwing', async () => {
    const sessionId = createSessionId();

    await expect(listPublishedReviews('passport-renewal')).resolves.toEqual([]);
    await expect(
      submitReview({
        sessionId,
        serviceSlug: 'passport-renewal',
        locale: 'en',
        body: 'Nothing can be stored without a database, and that must not throw.',
        details: {},
      }),
    ).resolves.toBe(false);
    await expect(flagReview(randomUUID(), sessionId)).resolves.toBe(false);
  });
});
