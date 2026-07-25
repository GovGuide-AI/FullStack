import { z } from 'zod';
import { LOCALES } from '@/lib/locales';

/**
 * Validation for citizen-submitted reports.
 *
 * Nothing here is government knowledge — these are unverified accounts of what
 * one person experienced, stored in Postgres and rendered as such. The rules
 * below exist to keep the table from becoming an advertising channel for
 * fixers, which is the realistic abuse of a free-text box attached to a
 * government service page.
 */

export const MIN_REVIEW_BODY_LENGTH = 20;
export const MAX_REVIEW_BODY_LENGTH = 1000;
export const MAX_OFFICE_VISITED_LENGTH = 120;

/**
 * Enumerated rather than free text so the labels come from `messages/`, which
 * makes them bilingual without translating anyone's words. Only `body` and
 * `officeVisited` are untranslatable author text.
 */
export const WAIT_TIMES = ['under-hour', 'half-day', 'full-day', 'multiple-visits'] as const;
export type WaitTime = (typeof WAIT_TIMES)[number];

export const REVIEW_OUTCOMES = ['completed', 'rejected', 'still-trying'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

const LINK_PATTERN =
  /(?:https?:\/\/|www\.)|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|et|me|ly|co|info|biz|xyz|app|link|tg)\b/i;

/**
 * Seven consecutive digits, which is the shortest Ethiopian subscriber number.
 * Deliberately not tolerant of spaces or dashes between the digits: a report
 * saying "I paid 350 ETB on 12-03-2026" is exactly what this feature is for,
 * and rejecting it to catch a separated phone number would cost more than it
 * saves. A determined spammer defeats any pattern here; the flag queue is the
 * real backstop.
 */
const DIGIT_RUN_PATTERN = /\d{7,}/;

function freeTextSchema(minLength: number, maxLength: number) {
  return z
    .string()
    .trim()
    .min(minLength)
    .max(maxLength)
    .refine((value) => !LINK_PATTERN.test(value), 'links are not allowed')
    .refine((value) => !DIGIT_RUN_PATTERN.test(value), 'contact numbers are not allowed');
}

/**
 * Blank values are dropped before validation because an HTML form submits an
 * empty string for a detail the author left alone, and an absent detail is not
 * a validation failure.
 */
function omitBlankFields(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, field]) => field !== '' && field !== null,
    ),
  );
}

export const reviewDetailsSchema = z.preprocess(
  omitBlankFields,
  z.object({
    officeVisited: freeTextSchema(1, MAX_OFFICE_VISITED_LENGTH).optional(),
    waitTime: z.enum(WAIT_TIMES).optional(),
    outcome: z.enum(REVIEW_OUTCOMES).optional(),
  }),
);

export type ReviewDetails = z.infer<typeof reviewDetailsSchema>;

export const reviewSubmissionSchema = z.object({
  serviceSlug: z.string().min(1).max(64),
  /** The language the author wrote in, which is not necessarily the reader's. */
  locale: z.enum(LOCALES),
  body: freeTextSchema(MIN_REVIEW_BODY_LENGTH, MAX_REVIEW_BODY_LENGTH),
  details: reviewDetailsSchema.default({}),
});

export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
