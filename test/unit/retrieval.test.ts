import { describe, expect, it } from 'vitest';
import { Bm25Index, tokenize } from '@/lib/retrieval/bm25';
import { chunkText, dropRepeatedLines, htmlToText } from '@/lib/retrieval/text';

describe('tokenize', () => {
  it('lowercases Latin text and drops function words', () => {
    expect(tokenize('The Trade License and the Fee')).toEqual(['trade', 'license', 'fee']);
  });

  it('keeps Ethiopic words as tokens', () => {
    expect(tokenize('የንግድ ምዝገባ')).toEqual(['የንግድ', 'ምዝገባ']);
  });

  it('splits Ethiopic on its own punctuation', () => {
    // Ethiopic punctuation is inside the U+1200 block, so a naive range glues
    // it onto the word and a sentence-final term stops matching the query.
    expect(tokenize('ፓስፖርት፣ መታወቂያ። ክፍያ')).toEqual(['ፓስፖርት', 'መታወቂያ', 'ክፍያ']);
  });

  it('indexes a word identically whether or not it ends a sentence', () => {
    expect(tokenize('ክፍያ።')).toEqual(tokenize('ክፍያ'));
  });

  it('handles a mixed-script line, which is how these pages are actually written', () => {
    expect(tokenize('TIN የግብር ከፋይ')).toEqual(['tin', 'የግብር', 'ከፋይ']);
  });

  it('drops single characters and returns nothing for punctuation alone', () => {
    expect(tokenize('a b -- //')).toEqual([]);
  });
});

describe('Bm25Index', () => {
  const documents = [
    { id: 'passport', text: 'Apply for a new Ethiopian passport at the immigration office.' },
    { id: 'licence', text: 'Renew the trade licence every year with an audit report.' },
    { id: 'tin', text: 'Register for a taxpayer identification number at the tax office.' },
    { id: 'amharic', text: 'የንግድ ምዝገባ የሚደረገው በንግድ ቢሮ ነው።' },
  ];
  const index = new Bm25Index(documents);

  it('ranks the document containing the query terms first', () => {
    expect(index.search('trade licence renewal')[0]?.document.id).toBe('licence');
  });

  it('retrieves Amharic queries', () => {
    expect(index.search('የንግድ ምዝገባ')[0]?.document.id).toBe('amharic');
  });

  it('returns nothing when no term matches, rather than a weak guess', () => {
    // The drafting step depends on this: an empty bundle tells an author the
    // corpus does not cover the topic, which is a useful answer. A padded list
    // of irrelevant passages would invite them to write from the wrong source.
    expect(index.search('helicopter maintenance')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(index.search('office', 1)).toHaveLength(1);
  });

  it('scores a term appearing in every document at zero, not negative', () => {
    const uniform = new Bm25Index([
      { id: 'a', text: 'office office' },
      { id: 'b', text: 'office' },
    ]);
    // With the unshifted IDF this term would score negatively and invert the
    // ranking. Every hit is filtered out instead of being ordered backwards.
    for (const hit of uniform.search('office')) {
      expect(hit.score).toBeGreaterThan(0);
    }
  });

  it('handles an empty corpus without throwing', () => {
    expect(new Bm25Index([]).search('anything')).toEqual([]);
  });
});

describe('htmlToText', () => {
  it('drops scripts and styles entirely', () => {
    const html = '<p>Keep</p><script>const secret = 1;</script><style>.a{color:red}</style>';
    const text = htmlToText(html);

    expect(text).toContain('Keep');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('color');
  });

  it('breaks lines at block boundaries so a document list stays a list', () => {
    const html = '<ul><li>Kebele ID</li><li>Birth certificate</li></ul>';

    expect(htmlToText(html).split('\n')).toEqual(['Kebele ID', 'Birth certificate']);
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToText('<p>Fees &amp; charges &#8212; 5,000</p>')).toBe('Fees & charges — 5,000');
  });

  it('preserves Ethiopic text', () => {
    expect(htmlToText('<h1>የንግድ ምዝገባ</h1>')).toBe('የንግድ ምዝገባ');
  });
});

describe('dropRepeatedLines', () => {
  it('removes the navigation that every page on a site repeats', () => {
    const pages = [
      'Home\nServices\nCommercial registration requires a TIN certificate.',
      'Home\nServices\nTrade licence renewal requires an audit report.',
      'Home\nServices\nTrade name registration is a separate step.',
    ];

    const cleaned = dropRepeatedLines(pages);

    expect(cleaned[0]).toBe('Commercial registration requires a TIN certificate.');
    expect(cleaned.join('\n')).not.toContain('Home');
  });

  it('keeps a long line even when it repeats, because prose is not chrome', () => {
    const sentence = `Customers must have a business registration certificate before requesting any of the services listed on this page, and must bring originals.`;
    const pages = [sentence, sentence, sentence];

    expect(dropRepeatedLines(pages)[0]).toBe(sentence);
  });
});

describe('chunkText', () => {
  it('keeps a short document as a single chunk', () => {
    expect(chunkText('One line only.')).toHaveLength(1);
  });

  it('splits a long document and overlaps consecutive chunks', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Line number ${i} of the document.`).join('\n');
    const chunks = chunkText(text, { size: 200, overlap: 60 });

    expect(chunks.length).toBeGreaterThan(1);

    // The overlap is a whole number of trailing lines, so the head of the
    // second chunk must be exactly the tail of the first.
    const firstLines = (chunks[0] as { text: string }).text.split('\n');
    const secondLines = (chunks[1] as { text: string }).text.split('\n');
    const carried = firstLines.filter((line) => secondLines.includes(line));

    expect(carried.length).toBeGreaterThan(0);
    expect(firstLines.slice(-carried.length)).toEqual(secondLines.slice(0, carried.length));
  });

  it('never splits a line in half', () => {
    const text = ['short', 'a'.repeat(500), 'short again'].join('\n');

    for (const chunk of chunkText(text, { size: 100, overlap: 20 })) {
      for (const line of chunk.text.split('\n')) {
        expect(['short', 'a'.repeat(500), 'short again']).toContain(line);
      }
    }
  });

  it('returns nothing for whitespace', () => {
    expect(chunkText('   \n\n  \n')).toEqual([]);
  });

  it('numbers chunks consecutively from zero', () => {
    const text = Array.from({ length: 20 }, (_, i) => `Line ${i}`).join('\n');
    const chunks = chunkText(text, { size: 40, overlap: 10 });

    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, i) => i));
  });
});
