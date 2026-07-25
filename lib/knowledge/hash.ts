import { createHash } from 'node:crypto';
import { getCatalogSlugs } from './catalog';
import type { Service } from './schema';

/**
 * Content hashes used in AI cache keys.
 *
 * Including a hash of the underlying knowledge means that correcting a fee in a
 * YAML file invalidates every cached answer derived from it. Without this, a
 * fixed mistake would keep being served from cache — which is the worst
 * possible caching bug for this particular product.
 */
export function hashService(service: Service): string {
  return sha256(JSON.stringify(service)).slice(0, 16);
}

export function hashCatalog(): string {
  return sha256(getCatalogSlugs().join('|')).slice(0, 16);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildCacheKey(parts: readonly string[]): string {
  return sha256(parts.join('\u0000'));
}
