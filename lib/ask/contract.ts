import { z } from 'zod';
import type { Citation } from '@/lib/knowledge/citations';
import type { ServiceCategory } from '@/lib/knowledge/schema';
import type { ServiceView } from '@/lib/knowledge/view';
import { LOCALES } from '@/lib/locales';

export const MAX_QUESTION_LENGTH = 500;

/**
 * A single round of back-and-forth, carried by the client rather than stored.
 *
 * The service holds no conversation state: the browser sends back what was
 * asked and what the user replied, so a clarification survives without the
 * server having to remember anyone. Exactly one round is supported, which is
 * enough to separate "new passport" from "replace a lost one" without turning
 * a guidance tool into a chatbot.
 */
export const clarificationSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  answer: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
});

export type Clarification = z.infer<typeof clarificationSchema>;

export const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  locale: z.enum(LOCALES),
  clarification: clarificationSchema.optional(),
});

export type AskRequest = z.infer<typeof askRequestSchema>;

/**
 * A covered service the router judged close to the question without matching it.
 *
 * Carries only what a link needs. Deliberately not a `ServiceView`: a suggestion
 * is an offer to go and read a record, not a partial answer, and serializing
 * fields the user has not asked for invites showing them.
 */
export interface ServiceSuggestion {
  readonly slug: string;
  readonly title: string;
  readonly category: ServiceCategory;
}

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
      /** Services the answer is most likely to be one of. May be empty. */
      readonly options: readonly ServiceSuggestion[];
    }
  | {
      readonly kind: 'not-covered';
      /**
       * Nearby services, or empty when the question was nowhere near the
       * catalog. Empty is the honest result and must stay possible.
       */
      readonly suggestions: readonly ServiceSuggestion[];
    };

export type AskErrorCode = 'invalid-request' | 'rate-limited' | 'unavailable';

export interface AskErrorResponse {
  readonly error: AskErrorCode;
}
