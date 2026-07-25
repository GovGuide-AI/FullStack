/**
 * BM25 ranking over the ingested chunk index.
 *
 * Retrieval here only ever feeds a human-reviewed drafting step — it selects
 * which official paragraphs an author reads before writing a curated record. It
 * is never in the request path and never reaches the model, so lexical ranking
 * is the right tool: it is inspectable, deterministic, and cannot invent a
 * passage that is not in the corpus.
 */

/**
 * Ethiopic has no case and separates words with spaces, so one tokeniser covers
 * both scripts.
 *
 * The upper bound matters: the Ethiopic block runs to U+137F, but only
 * U+1200–U+135F are letters and combining marks. U+1361–U+1368 are punctuation
 * (`፣`, `።` and friends) and U+1369–U+137C are digits. Matching the whole block
 * would glue the full stop onto the preceding word, so `ፓስፖርት` and `ፓስፖርት።`
 * would index as unrelated terms and a query would miss every sentence-final
 * occurrence.
 */
const TOKEN_PATTERN = /[a-z0-9]+|[\u1200-\u135F]+/g;

/**
 * English function words only. No Amharic stop list is applied: choosing one
 * badly would silently drop meaningful terms, and the corpus is small enough
 * that the IDF term already discounts words appearing in every document.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'you', 'your', 'this', 'they', 'their', 'we', 'our',
]);

export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(TOKEN_PATTERN);
  if (matches === null) return [];
  return matches.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export interface Bm25Document {
  readonly id: string;
  readonly text: string;
}

export interface Bm25Hit<T extends Bm25Document = Bm25Document> {
  readonly document: T;
  readonly score: number;
}

export interface Bm25Options {
  /** Term-frequency saturation. Higher rewards repetition more. */
  readonly k1?: number;
  /** Length normalisation, 0 = none, 1 = full. */
  readonly b?: number;
}

interface IndexedDocument<T extends Bm25Document> {
  readonly document: T;
  readonly length: number;
  readonly frequencies: Map<string, number>;
}

export class Bm25Index<T extends Bm25Document = Bm25Document> {
  private readonly documents: IndexedDocument<T>[] = [];
  private readonly documentFrequency = new Map<string, number>();
  private readonly k1: number;
  private readonly b: number;
  private averageLength = 0;

  constructor(documents: readonly T[], options: Bm25Options = {}) {
    this.k1 = options.k1 ?? 1.5;
    this.b = options.b ?? 0.75;

    let totalLength = 0;
    for (const document of documents) {
      const tokens = tokenize(document.text);
      const frequencies = new Map<string, number>();
      for (const token of tokens) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      }
      for (const term of frequencies.keys()) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }
      this.documents.push({ document, length: tokens.length, frequencies });
      totalLength += tokens.length;
    }

    this.averageLength = documents.length === 0 ? 0 : totalLength / documents.length;
  }

  get size(): number {
    return this.documents.length;
  }

  /**
   * Robertson/Sparck-Jones IDF with the +1 shift, which keeps the weight
   * non-negative for a term that appears in more than half the corpus. Without
   * the shift such terms score negatively and actively push relevant documents
   * down the ranking.
   */
  private idf(term: string): number {
    const n = this.documents.length;
    const df = this.documentFrequency.get(term) ?? 0;
    if (df === 0) return 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, limit = 10): Bm25Hit<T>[] {
    const terms = tokenize(query);
    if (terms.length === 0 || this.documents.length === 0) return [];

    const uniqueTerms = [...new Set(terms)];
    const hits: Bm25Hit<T>[] = [];

    for (const indexed of this.documents) {
      let score = 0;
      for (const term of uniqueTerms) {
        const frequency = indexed.frequencies.get(term);
        if (frequency === undefined) continue;
        const normalisation =
          this.averageLength === 0 ? 1 : 1 - this.b + (this.b * indexed.length) / this.averageLength;
        score +=
          this.idf(term) *
          ((frequency * (this.k1 + 1)) / (frequency + this.k1 * normalisation));
      }
      if (score > 0) {
        hits.push({ document: indexed.document, score });
      }
    }

    return hits.sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id))
      .slice(0, limit);
  }
}
