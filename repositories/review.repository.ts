import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { reviewFlags, reviews } from '@/db/schema';
import type { Locale } from '@/lib/locales';
import type { ReviewDetails } from '@/lib/reviews/schema';
import { withDb } from './with-db';

/** Flags needed before a report is hidden from the page. */
export const FLAGS_TO_HIDE = 3;

const DEFAULT_REVIEW_LIMIT = 20;

/**
 * What the page is allowed to see. `sessionId` is deliberately absent: there is
 * no read path that ties a report back to the visitor who wrote it.
 */
export interface PublishedReview {
  readonly id: string;
  readonly locale: Locale;
  readonly body: string;
  readonly details: ReviewDetails;
  readonly createdAt: Date;
}

export async function listPublishedReviews(
  serviceSlug: string,
  limit: number = DEFAULT_REVIEW_LIMIT,
): Promise<PublishedReview[]> {
  return withDb(
    'listPublishedReviews',
    async (db) =>
      db
        .select({
          id: reviews.id,
          locale: reviews.locale,
          body: reviews.body,
          details: reviews.details,
          createdAt: reviews.createdAt,
        })
        .from(reviews)
        .where(and(eq(reviews.serviceSlug, serviceSlug), eq(reviews.status, 'published')))
        .orderBy(desc(reviews.createdAt))
        .limit(limit),
    [],
  );
}

export interface ReviewSubmissionRecord {
  readonly sessionId: string;
  readonly serviceSlug: string;
  readonly locale: Locale;
  readonly body: string;
  readonly details: ReviewDetails;
}

export async function submitReview(record: ReviewSubmissionRecord): Promise<boolean> {
  return withDb(
    'submitReview',
    async (db) => {
      await db.insert(reviews).values(record);
      return true;
    },
    false,
  );
}

/**
 * Records one visitor's objection to a report.
 *
 * The flag row and the counter move together in a transaction, and the counter
 * is incremented and compared against the threshold in a single statement, so
 * two people flagging at once cannot both read the old count and leave a report
 * visible past its third flag.
 */
export async function flagReview(reviewId: string, sessionId: string): Promise<boolean> {
  return withDb(
    'flagReview',
    async (db) =>
      db.transaction(async (tx) => {
        const inserted = await tx
          .insert(reviewFlags)
          .values({ reviewId, sessionId })
          .onConflictDoNothing({ target: [reviewFlags.reviewId, reviewFlags.sessionId] })
          .returning({ id: reviewFlags.id });

        // A repeat flag from the same visitor is accepted and not counted again.
        if (inserted.length === 0) return true;

        await tx
          .update(reviews)
          .set({
            flagCount: sql`${reviews.flagCount} + 1`,
            status: sql`case when ${reviews.flagCount} + 1 >= ${FLAGS_TO_HIDE} then 'hidden' else ${reviews.status} end`,
          })
          .where(eq(reviews.id, reviewId));

        return true;
      }),
    false,
  );
}
