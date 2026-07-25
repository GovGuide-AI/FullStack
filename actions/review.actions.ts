'use server';

import { z } from 'zod';
import { getService } from '@/lib/knowledge/loader';
import { isLocale } from '@/lib/locales';
import { checkRateLimit } from '@/lib/rate-limit';
import { reviewSubmissionSchema } from '@/lib/reviews/schema';
import { requireSessionId } from '@/lib/session.server';
import { flagReview, submitReview } from '@/repositories/review.repository';
import { ensureSession } from '@/repositories/session.repository';

const HOUR_IN_SECONDS = 3600;
const REVIEWS_PER_HOUR = 3;
const FLAGS_PER_HOUR = 20;

const flagSchema = z.object({
  reviewId: z.uuid(),
  locale: z.string().refine(isLocale, 'unsupported locale'),
});

/** A code the form maps to a string from `messages/`, never a raw message. */
export type ReviewErrorCode = 'invalid' | 'unknown-service' | 'rate-limited' | 'unavailable';

export interface SubmitReviewResult {
  readonly submitted: boolean;
  readonly error: ReviewErrorCode | null;
}

export interface FlagReviewResult {
  readonly flagged: boolean;
  readonly error: ReviewErrorCode | null;
}

/**
 * Stores one citizen's account of using a service.
 *
 * Unlike the checklist, a failure here is reported rather than absorbed: this
 * feature is pure persistence, so pretending a report was saved when no
 * database accepted it would be a lie the visitor cannot detect.
 */
export async function submitReviewAction(input: unknown): Promise<SubmitReviewResult> {
  const parsed = reviewSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { submitted: false, error: 'invalid' };
  }

  // A slug that is not in the catalog is rejected rather than stored, so the
  // table cannot be used to write arbitrary strings.
  if (!getService(parsed.data.serviceSlug)) {
    return { submitted: false, error: 'unknown-service' };
  }

  const sessionId = await requireSessionId();

  const limit = checkRateLimit(`review:submit:${sessionId}`, REVIEWS_PER_HOUR, HOUR_IN_SECONDS);
  if (!limit.allowed) {
    return { submitted: false, error: 'rate-limited' };
  }

  // The session row has to exist first: `reviews.session_id` references it.
  const sessionReady = await ensureSession(sessionId, parsed.data.locale);
  if (!sessionReady) {
    return { submitted: false, error: 'unavailable' };
  }

  const submitted = await submitReview({
    sessionId,
    serviceSlug: parsed.data.serviceSlug,
    locale: parsed.data.locale,
    body: parsed.data.body,
    details: parsed.data.details,
  });

  return submitted ? { submitted: true, error: null } : { submitted: false, error: 'unavailable' };
}

/**
 * Flags a report as misleading. Three flags hide it.
 *
 * The limit is far looser than for submissions because flagging is the only
 * moderation this project has, and the unique index already stops one visitor
 * from hiding a report alone.
 */
export async function flagReviewAction(input: unknown): Promise<FlagReviewResult> {
  const parsed = flagSchema.safeParse(input);
  if (!parsed.success) {
    return { flagged: false, error: 'invalid' };
  }

  const sessionId = await requireSessionId();

  const limit = checkRateLimit(`review:flag:${sessionId}`, FLAGS_PER_HOUR, HOUR_IN_SECONDS);
  if (!limit.allowed) {
    return { flagged: false, error: 'rate-limited' };
  }

  const sessionReady = await ensureSession(sessionId, parsed.data.locale);
  if (!sessionReady) {
    return { flagged: false, error: 'unavailable' };
  }

  const flagged = await flagReview(parsed.data.reviewId, sessionId);
  return flagged ? { flagged: true, error: null } : { flagged: false, error: 'unavailable' };
}
