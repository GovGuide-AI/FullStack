import 'server-only';
import { z } from 'zod';

/**
 * Server-only configuration.
 *
 * The `server-only` import above is the guard that matters: importing this
 * module from a Client Component is a build error, so an API key cannot reach
 * the browser by accident.
 */
const envSchema = z.object({
  /**
   * Optional. Without it the app still answers questions — it just cannot
   * remember sessions or saved checklists. Guidance is more important than
   * persistence, so a missing database degrades rather than fails.
   */
  DATABASE_URL: z.string().min(1).optional(),

  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_ROUTER_MODEL: z.string().min(1),
  OPENROUTER_ANSWER_MODEL: z.string().min(1),
  OPENROUTER_SUMMARY_MODEL: z.string().min(1).optional(),

  /** Public origin, used for the OpenRouter attribution headers. */
  APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Validated lazily rather than at import time so that `next build` — which
 * imports every module but has no reason to hold an API key — does not fail on
 * a machine without secrets.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Whether persistence is configured. Callers degrade instead of throwing. */
export function hasDatabase(): boolean {
  return typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0;
}
