import { z } from 'zod';

export { LOCALES, type Locale } from '../locales';

/**
 * Both languages are mandatory. A half-translated record would silently render
 * blank sections to Amharic readers, so the build rejects it instead.
 */
export const localizedTextSchema = z.object({
  en: z.string().min(1),
  am: z.string().min(1),
});
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case');

/**
 * `Date.parse` is not enough here: it silently rolls 2026-02-31 over to March 3
 * rather than rejecting it. Comparing the parsed components back against the
 * input is what actually catches an impossible date.
 */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date, YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, 'must be a real calendar date');

export const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), 'must be an https URL');

export const SERVICE_CATEGORIES = [
  'identity',
  'travel',
  'business',
  'tax',
  'property',
  'vehicle',
  'education',
  'health',
  'civil-registration',
  'other',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const documentSchema = z.object({
  name: localizedTextSchema,
  notes: localizedTextSchema.optional(),
  required: z.boolean().default(true),
  copies: z.number().int().positive().optional(),
});

/**
 * Some fees are a fixed published figure and some genuinely vary by case. The
 * union forces an author to say which, rather than inventing a precise number
 * for something that has none.
 */
export const feeAmountSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fixed'),
    value: z.number().nonnegative(),
    currency: z.enum(['ETB', 'USD']),
  }),
  z.object({
    kind: z.literal('variable'),
    description: localizedTextSchema,
  }),
]);
export type FeeAmount = z.infer<typeof feeAmountSchema>;

export const feeSchema = z.object({
  label: localizedTextSchema,
  amount: feeAmountSchema,
  notes: localizedTextSchema.optional(),
});

export const officeSchema = z.object({
  name: localizedTextSchema,
  address: localizedTextSchema,
  hours: localizedTextSchema.optional(),
  phone: z.string().min(3).optional(),
  website: httpsUrlSchema.optional(),
});

export const stepSchema = z.object({
  title: localizedTextSchema,
  detail: localizedTextSchema.optional(),
});

/**
 * Provenance for every fact in the record. `verified` is deliberately required
 * with no default: an author must make an explicit claim about whether a human
 * checked these figures against the cited sources.
 */
export const verificationSchema = z.object({
  verified: z.boolean(),
  lastVerified: isoDateSchema,
  sourceUrls: z.array(httpsUrlSchema),
  note: localizedTextSchema.optional(),
});
export type Verification = z.infer<typeof verificationSchema>;

export const serviceSchema = z
  .object({
    slug: slugSchema,
    category: z.enum(SERVICE_CATEGORIES),
    title: localizedTextSchema,
    summary: localizedTextSchema,
    /** Alternative phrasings a user might type. Feeds the router prompt. */
    aliases: z
      .object({
        en: z.array(z.string().min(1)).default([]),
        am: z.array(z.string().min(1)).default([]),
      })
      .default({ en: [], am: [] }),
    eligibility: z.array(localizedTextSchema).default([]),
    documents: z.array(documentSchema).default([]),
    fees: z.array(feeSchema).default([]),
    offices: z.array(officeSchema).default([]),
    steps: z.array(stepSchema).default([]),
    processingTime: localizedTextSchema.optional(),
    commonMistakes: z.array(localizedTextSchema).default([]),
    followUp: z.array(localizedTextSchema).default([]),
    verification: verificationSchema,
  })
  .strict()
  .superRefine((service, ctx) => {
    // A record claiming to be verified with nothing to verify against is the
    // most dangerous state possible: it renders without any warning banner.
    if (service.verification.verified && service.verification.sourceUrls.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['verification', 'sourceUrls'],
        message: 'a verified service must cite at least one official source URL',
      });
    }
  });

export type Service = z.infer<typeof serviceSchema>;
