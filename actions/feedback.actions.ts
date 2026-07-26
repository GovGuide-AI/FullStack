'use server';

import { z } from 'zod';
import { getService } from '@/lib/knowledge/loader';
import { isLocale } from '@/lib/locales';
import { requireSessionId } from '@/lib/session.server';
import { submitFeedback } from '@/repositories/feedback.repository';
import { ensureSession } from '@/repositories/session.repository';

const feedbackSchema = z.object({
  serviceSlug: z.string().min(1).max(64).nullable(),
  rating: z.union([z.literal(-1), z.literal(1)]),
  locale: z.string().refine(isLocale, 'unsupported locale'),
});

export interface FeedbackResult {
  readonly recorded: boolean;
}

/**
 * Records whether an answer helped.
 *
 * This is the only signal the project has for which services people ask about
 * and where the guidance falls short, so it is worth collecting — but it is
 * anonymous, ratings-only, and never blocks the page when it fails.
 */
export async function submitFeedbackAction(input: unknown): Promise<FeedbackResult> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { recorded: false };
  }

  // A slug that is not in the catalog is rejected rather than stored, so the
  // table cannot be used to write arbitrary strings.
  if (parsed.data.serviceSlug !== null && !getService(parsed.data.serviceSlug)) {
    return { recorded: false };
  }

  const sessionId = await requireSessionId();

  const sessionReady = await ensureSession(sessionId, parsed.data.locale);
  if (!sessionReady) {
    return { recorded: false };
  }

  const recorded = await submitFeedback({
    sessionId,
    serviceSlug: parsed.data.serviceSlug,
    rating: parsed.data.rating,
    comment: null,
  });

  return { recorded };
}
