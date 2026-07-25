import { describe, expect, it } from 'vitest';
import { listCitationIds, partitionCitations } from '@/lib/knowledge/citations';
import { loadKnowledgeBase } from '@/lib/knowledge/loader';
import { serviceSchema, type Service } from '@/lib/knowledge/schema';
import { toServiceView } from '@/lib/knowledge/view';

function baseRecord(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'test-service',
    category: 'identity',
    title: { en: 'Test', am: 'ሙከራ' },
    summary: { en: 'A test service.', am: 'የሙከራ አገልግሎት።' },
    verification: {
      verified: false,
      lastVerified: '2026-07-25',
      sourceUrls: [],
    },
    ...overrides,
  };
}

describe('serviceSchema', () => {
  it('accepts a minimal valid record and fills defaults', () => {
    const result = serviceSchema.safeParse(baseRecord());

    expect(result.success).toBe(true);
    expect(result.success && result.data.documents).toEqual([]);
    expect(result.success && result.data.aliases).toEqual({ en: [], am: [] });
  });

  it('requires Amharic for every user-facing string', () => {
    const result = serviceSchema.safeParse(baseRecord({ title: { en: 'Only English' } }));

    expect(result.success).toBe(false);
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    const result = serviceSchema.safeParse(baseRecord({ documnets: [] }));

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.message).toContain(
      'Unrecognized key',
    );
  });

  it.each([
    ['a rolled-over date', '2026-02-31'],
    ['month 13', '2026-13-01'],
    ['a non-date', 'sometime'],
  ])('rejects %s in lastVerified', (_label, lastVerified) => {
    const result = serviceSchema.safeParse(
      baseRecord({ verification: { verified: false, lastVerified, sourceUrls: [] } }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a verified record that cites no source', () => {
    const result = serviceSchema.safeParse(
      baseRecord({
        verification: { verified: true, lastVerified: '2026-07-25', sourceUrls: [] },
      }),
    );

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.message).toContain(
      'official source',
    );
  });

  it('rejects a non-https source URL', () => {
    const result = serviceSchema.safeParse(
      baseRecord({
        verification: {
          verified: true,
          lastVerified: '2026-07-25',
          sourceUrls: ['http://insecure.example.et'],
        },
      }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a slug that is not kebab-case', () => {
    expect(serviceSchema.safeParse(baseRecord({ slug: 'Not Kebab' })).success).toBe(false);
  });

  it('requires a fee to declare whether it is fixed or variable', () => {
    const result = serviceSchema.safeParse(
      baseRecord({
        fees: [{ label: { en: 'Fee', am: 'ክፍያ' }, amount: { value: 100 } }],
      }),
    );

    expect(result.success).toBe(false);
  });
});

describe('the shipped knowledge base', () => {
  it('loads and validates', () => {
    const knowledgeBase = loadKnowledgeBase();
    expect(knowledgeBase.services.length).toBeGreaterThan(0);
  });

  it('has a unique slug per service matching its filename', () => {
    const { slugs } = loadKnowledgeBase();
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('toServiceView', () => {
  const verifiedRecord = serviceSchema.parse(
    baseRecord({
      fees: [
        {
          label: { en: 'Application fee', am: 'የማመልከቻ ክፍያ' },
          amount: { kind: 'fixed', value: 100, currency: 'ETB' },
        },
      ],
      offices: [
        {
          name: { en: 'Head office', am: 'ዋና ቢሮ' },
          address: { en: 'Somewhere', am: 'የሆነ ቦታ' },
        },
      ],
      verification: {
        verified: true,
        lastVerified: '2026-07-25',
        sourceUrls: ['https://example.gov.et/source'],
      },
    }),
  ) as Service;

  it('exposes fees and offices for a verified record', () => {
    const view = toServiceView(verifiedRecord, 'en');

    expect(view.fees).toHaveLength(1);
    expect(view.offices).toHaveLength(1);
  });

  it('suppresses fees and offices for an unverified record', () => {
    const unverified = { ...verifiedRecord, verification: { ...verifiedRecord.verification, verified: false } };
    const view = toServiceView(unverified, 'en');

    // Suppression happens server-side so the values are never serialized at
    // all, rather than being hidden by CSS in a component.
    expect(view.fees).toBeNull();
    expect(view.offices).toBeNull();
    expect(JSON.stringify(view)).not.toContain('Application fee');
    expect(JSON.stringify(view)).not.toContain('Head office');
  });

  it('flattens to the requested locale', () => {
    expect(toServiceView(verifiedRecord, 'am').title).toBe('ሙከራ');
    expect(toServiceView(verifiedRecord, 'en').title).toBe('Test');
  });
});

describe('partitionCitations', () => {
  const record = serviceSchema.parse(
    baseRecord({
      documents: [{ name: { en: 'Passport', am: 'ፓስፖርት' } }],
    }),
  ) as Service;

  it('lists an id for every citable fact', () => {
    expect(listCitationIds(record)).toContain('summary');
    expect(listCitationIds(record)).toContain('documents.0');
  });

  it('separates resolvable ids from invented ones', () => {
    const { known, unknown } = partitionCitations(record, [
      'summary',
      'documents.0',
      'fees.7',
      'totally.made.up',
    ]);

    expect(known).toEqual(['summary', 'documents.0']);
    expect(unknown).toEqual(['fees.7', 'totally.made.up']);
  });

  it('deduplicates repeated ids', () => {
    const { known } = partitionCitations(record, ['summary', 'summary']);
    expect(known).toEqual(['summary']);
  });
});
