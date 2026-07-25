import { z } from 'zod';

/**
 * Sentinel values the router may return instead of a service slug.
 *
 * Modelled as members of the same enum rather than as `null` so the entire
 * decision is a single closed set of strings. Every model that supports
 * structured output handles a string enum well; nullable unions are less
 * consistently respected.
 */
export const NO_MATCH = '__none__';
export const NEEDS_CLARIFICATION = '__clarify__';

export type RouterDecision = z.infer<ReturnType<typeof buildRouterSchema>>;

/**
 * Built per request from the live catalog. Because the allowed slugs are baked
 * into the schema, a model physically cannot name a service that is not in the
 * knowledge base — the SDK rejects the generation before it reaches us.
 */
export function buildRouterSchema(slugs: readonly string[]) {
  // Sentinels lead so the tuple is provably non-empty for `z.enum`.
  const options: [string, ...string[]] = [NO_MATCH, NEEDS_CLARIFICATION, ...slugs];

  return z.object({
    serviceSlug: z
      .enum(options)
      .describe(
        `The slug of the single best matching service, or "${NO_MATCH}" if no listed service matches, or "${NEEDS_CLARIFICATION}" if the request is too vague to choose between listed services.`,
      ),
    clarifyingQuestion: z
      .string()
      .describe(
        `A single short question to ask the user. Required when serviceSlug is "${NEEDS_CLARIFICATION}", otherwise an empty string.`,
      ),
  });
}

export const explanationSchema = z.object({
  explanation: z
    .string()
    .describe(
      'Two to four sentences orienting the user, using only facts present in the provided record.',
    ),
  citations: z
    .array(z.string())
    .describe('The ids of every record fact the explanation relies on. Never invent an id.'),
});

export type Explanation = z.infer<typeof explanationSchema>;
