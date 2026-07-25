import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { serviceSchema, type Service } from './schema';

export const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge', 'services');

export class KnowledgeValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Knowledge base failed validation:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'KnowledgeValidationError';
    this.issues = issues;
  }
}

export interface KnowledgeBase {
  readonly services: readonly Service[];
  readonly bySlug: ReadonlyMap<string, Service>;
  readonly slugs: readonly string[];
}

function listYamlFiles(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(KNOWLEDGE_DIR);
  } catch {
    throw new KnowledgeValidationError([
      `knowledge directory not found at ${KNOWLEDGE_DIR}`,
    ]);
  }
  return entries.filter((name) => name.endsWith('.yaml') || name.endsWith('.yml')).sort();
}

/**
 * Reads and validates every service file. Collects all problems across all
 * files before throwing, so an author fixing the knowledge base sees the whole
 * list at once instead of one error per build.
 */
export function loadKnowledgeBase(): KnowledgeBase {
  const issues: string[] = [];
  const services: Service[] = [];
  const seenSlugs = new Map<string, string>();

  for (const fileName of listYamlFiles()) {
    const filePath = path.join(KNOWLEDGE_DIR, fileName);

    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(filePath, 'utf8'));
    } catch (error) {
      issues.push(`${fileName}: not valid YAML — ${(error as Error).message}`);
      continue;
    }

    const parsed = serviceSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const location = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        issues.push(`${fileName}: ${location} — ${issue.message}`);
      }
      continue;
    }

    const service = parsed.data;
    const expectedFileName = `${service.slug}.yaml`;
    if (fileName !== expectedFileName) {
      issues.push(
        `${fileName}: slug "${service.slug}" requires the file to be named ${expectedFileName}`,
      );
    }

    const duplicateOf = seenSlugs.get(service.slug);
    if (duplicateOf !== undefined) {
      issues.push(`${fileName}: slug "${service.slug}" is already defined in ${duplicateOf}`);
      continue;
    }

    seenSlugs.set(service.slug, fileName);
    services.push(service);
  }

  if (services.length === 0 && issues.length === 0) {
    issues.push(`no service files found in ${KNOWLEDGE_DIR}`);
  }

  if (issues.length > 0) {
    throw new KnowledgeValidationError(issues);
  }

  return {
    services,
    bySlug: new Map(services.map((service) => [service.slug, service])),
    slugs: services.map((service) => service.slug),
  };
}

let cached: KnowledgeBase | null = null;

/**
 * Cached for production, re-read in development so editing a YAML file shows up
 * without restarting the dev server.
 */
export function getKnowledgeBase(): KnowledgeBase {
  if (process.env.NODE_ENV === 'development') {
    return loadKnowledgeBase();
  }
  cached ??= loadKnowledgeBase();
  return cached;
}

export function getService(slug: string): Service | undefined {
  return getKnowledgeBase().bySlug.get(slug);
}
