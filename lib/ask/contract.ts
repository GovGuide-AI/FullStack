import { z } from 'zod';
import type { Citation } from '@/lib/knowledge/citations';
import type { ServiceView } from '@/lib/knowledge/view';
import { LOCALES } from '@/lib/locales';

export const MAX_QUESTION_LENGTH = 500;

export const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  locale: z.enum(LOCALES),
});

export type AskRequest = z.infer<typeof askRequestSchema>;

/**
 * The three outcomes a question can have. Modelled as a discriminated union so
 * the UI cannot forget to handle one, and so "we don't know" is a first-class
 * result rather than an error or an empty answer.
 */
export type AskResponse =
  | {
      readonly kind: 'answer';
      readonly service: ServiceView;
      /** Model prose, or `null` when it failed citation validation. */
      readonly explanation: string | null;
      /** Facts from the record that the explanation is built on. */
      readonly citations: readonly Citation[];
      readonly grounded: boolean;
    }
  | {
      readonly kind: 'clarify';
      readonly question: string;
    }
  | {
      readonly kind: 'not-covered';
    };

export type AskErrorCode = 'invalid-request' | 'rate-limited' | 'unavailable';

export interface AskErrorResponse {
  readonly error: AskErrorCode;
}
