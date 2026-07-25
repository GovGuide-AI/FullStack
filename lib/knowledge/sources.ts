import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { httpsUrlSchema, slugSchema } from './schema';

export const SOURCES_FILE = path.join(process.cwd(), 'knowledge', 'sources.json');

/**
 * `official` is the authority lane: a government publisher speaking about its
 * own procedure. `community` is anything else. The distinction is load-bearing
 * — a curated record may only draw facts from the official lane, and the
 * community lane exists so that hearsay can be collected later without ever
 * being mistaken for the verified roadmap.
 */
export const SOURCE_LANES = ['official', 'community'] as const;
export type SourceLane = (typeof SOURCE_LANES)[number];

export const SOURCE_FORMATS = ['html', 'pdf'] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export const sourceSchema = z
  .object({
    id: slugSchema,
    title: z.string().min(3),
    /** The institution that published it, for attribution in evidence bundles. */
    publisher: z.string().min(2),
    url: httpsUrlSchema,
    lane: z.enum(SOURCE_LANES),
    format: z.enum(SOURCE_FORMATS),
    /** Free tags used to seed retrieval queries and to group evidence bundles. */
    topics: z.array(z.string().min(2)).min(1),
    /**
     * Several Ethiopian government hosts serve a valid Let's Encrypt leaf
     * certificate but omit the intermediate, so a correct client rejects the
     * chain. Ingest may relax verification for exactly these hosts. It is a
     * per-source opt-in rather than a global flag so that the exception stays
     * visible in review and cannot quietly spread to every fetch.
     */
    incompleteTlsChain: z.boolean().default(false),
    note: z.string().optional(),
  })
  .strict();

export type Source = z.infer<typeof sourceSchema>;

export const sourceRegistrySchema = z
  .object({
    sources: z.array(sourceSchema).min(1),
  })
  .strict()
  .superRefine((registry, ctx) => {
    const seen = new Map<string, number>();
    registry.sources.forEach((source, index) => {
      const previous = seen.get(source.id);
      if (previous !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources', index, 'id'],
          message: `duplicate source id "${source.id}", already used at index ${previous}`,
        });
      }
      seen.set(source.id, index);
    });
  });

export class SourceRegistryError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Source registry failed validation:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'SourceRegistryError';
    this.issues = issues;
  }
}

export interface SourceRegistry {
  readonly sources: readonly Source[];
  readonly byId: ReadonlyMap<string, Source>;
}

export function loadSourceRegistry(filePath: string = SOURCES_FILE): SourceRegistry {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new SourceRegistryError([`${filePath}: ${(error as Error).message}`]);
  }

  const parsed = sourceRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new SourceRegistryError(
      parsed.error.issues.map((issue) => {
        const location = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `${location} — ${issue.message}`;
      }),
    );
  }

  const { sources } = parsed.data;
  return {
    sources,
    byId: new Map(sources.map((source) => [source.id, source])),
  };
}

/**
 * A citation counts as registered when some entry in the registry is that URL
 * or a path prefix of it. Prefix matching lets one entry stand for a document
 * hub without forcing every deep link to be registered separately, while still
 * rejecting a citation to a domain nobody vetted.
 */
export function findRegisteredSource(
  registry: SourceRegistry,
  citationUrl: string,
): Source | undefined {
  let citation: URL;
  try {
    citation = new URL(citationUrl);
  } catch {
    return undefined;
  }

  let best: Source | undefined;
  for (const source of registry.sources) {
    let candidate: URL;
    try {
      candidate = new URL(source.url);
    } catch {
      continue;
    }
    if (candidate.origin !== citation.origin) continue;

    const base = candidate.pathname.replace(/\/$/, '');
    const target = citation.pathname.replace(/\/$/, '');
    const matches = base === '' || target === base || target.startsWith(`${base}/`);
    if (!matches) continue;

    // Prefer the most specific registered entry so attribution names the exact
    // document rather than the site root that also happens to match.
    if (best === undefined || base.length > new URL(best.url).pathname.replace(/\/$/, '').length) {
      best = source;
    }
  }
  return best;
}
