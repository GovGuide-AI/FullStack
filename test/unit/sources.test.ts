import { describe, expect, it } from 'vitest';
import {
  findRegisteredSource,
  loadSourceRegistry,
  sourceRegistrySchema,
  sourceSchema,
  type SourceRegistry,
} from '@/lib/knowledge/sources';
import { loadKnowledgeBase } from '@/lib/knowledge/loader';

function baseSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'example-source',
    title: 'An official page',
    publisher: 'Some Ministry',
    url: 'https://example.gov.et/page',
    lane: 'official',
    format: 'html',
    topics: ['passport'],
    ...overrides,
  };
}

describe('sourceSchema', () => {
  it('accepts a minimal entry and defaults the TLS exception to off', () => {
    const result = sourceSchema.safeParse(baseSource());

    expect(result.success).toBe(true);
    expect(result.success && result.data.incompleteTlsChain).toBe(false);
  });

  it('rejects a plain http URL', () => {
    expect(sourceSchema.safeParse(baseSource({ url: 'http://example.gov.et' })).success).toBe(
      false,
    );
  });

  it('requires at least one topic, since topics seed retrieval', () => {
    expect(sourceSchema.safeParse(baseSource({ topics: [] })).success).toBe(false);
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    expect(sourceSchema.safeParse(baseSource({ lanes: 'official' })).success).toBe(false);
  });

  it('rejects a lane outside the two known lanes', () => {
    expect(sourceSchema.safeParse(baseSource({ lane: 'semi-official' })).success).toBe(false);
  });
});

describe('sourceRegistrySchema', () => {
  it('rejects a duplicate id', () => {
    const result = sourceRegistrySchema.safeParse({
      sources: [baseSource(), baseSource({ url: 'https://example.gov.et/other' })],
    });

    expect(result.success).toBe(false);
  });
});

describe('findRegisteredSource', () => {
  const registry: SourceRegistry = {
    sources: [
      baseSource({ id: 'site-root', url: 'https://ics.gov.et/' }),
      baseSource({ id: 'notices', url: 'https://ics.gov.et/information/' }),
    ].map((source) => sourceSchema.parse(source)),
    byId: new Map(),
  };

  it('matches a deep link against a registered path prefix', () => {
    expect(findRegisteredSource(registry, 'https://ics.gov.et/information/new-passport/')?.id).toBe(
      'notices',
    );
  });

  it('prefers the most specific registered entry', () => {
    // Both entries match this URL; attribution should name the notices hub
    // rather than the site root.
    expect(findRegisteredSource(registry, 'https://ics.gov.et/information/x')?.id).toBe('notices');
  });

  it('does not match a different origin', () => {
    expect(findRegisteredSource(registry, 'https://evil.example/information/x')).toBeUndefined();
  });

  it('does not treat a shared prefix on a sibling path as a match', () => {
    const strict: SourceRegistry = {
      sources: [sourceSchema.parse(baseSource({ id: 'info', url: 'https://x.gov.et/info' }))],
      byId: new Map(),
    };

    expect(findRegisteredSource(strict, 'https://x.gov.et/information-leak')).toBeUndefined();
  });

  it('returns undefined for a malformed URL instead of throwing', () => {
    expect(findRegisteredSource(registry, 'not a url')).toBeUndefined();
  });
});

describe('the committed registry', () => {
  const registry = loadSourceRegistry();

  it('parses', () => {
    expect(registry.sources.length).toBeGreaterThan(0);
  });

  it('covers every URL cited by every service record', () => {
    // This is the invariant `npm run verify:citations` enforces, pinned here so
    // that adding a record with an unvetted source fails the test suite too and
    // not only the audit script.
    const unregistered: string[] = [];
    for (const service of loadKnowledgeBase().services) {
      for (const url of service.verification.sourceUrls) {
        if (findRegisteredSource(registry, url) === undefined) {
          unregistered.push(`${service.slug} → ${url}`);
        }
      }
    }

    expect(unregistered).toEqual([]);
  });

  it('cites nothing from the community lane, which is never procedure', () => {
    const communityCitations: string[] = [];
    for (const service of loadKnowledgeBase().services) {
      for (const url of service.verification.sourceUrls) {
        if (findRegisteredSource(registry, url)?.lane === 'community') {
          communityCitations.push(`${service.slug} → ${url}`);
        }
      }
    }

    expect(communityCitations).toEqual([]);
  });
});
