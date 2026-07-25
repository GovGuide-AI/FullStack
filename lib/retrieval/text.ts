/**
 * Text extraction and chunking for the knowledge pipeline.
 *
 * Deliberately dependency-free. The ingest targets are a handful of government
 * sites whose markup is ordinary server-rendered HTML; a full DOM parser buys
 * nothing here and a heavier extractor would still need the same hand-tuning
 * for the boilerplate these sites wrap every page in.
 */

const BLOCK_TAGS =
  /<\/?(?:p|div|section|article|header|footer|nav|li|ul|ol|tr|td|th|table|h[1-6]|br|hr)\b[^>]*>/gi;

/** Tags whose contents are never prose. */
const DROPPED_ELEMENTS = /<(script|style|noscript|svg|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#160': ' ',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    const named = HTML_ENTITIES[entity.toLowerCase()];
    if (named !== undefined) return named;
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return match;
  });
}

/**
 * Strips markup to readable text, preserving line breaks at block boundaries so
 * that a list of required documents does not collapse into one run-on line.
 */
export function htmlToText(html: string): string {
  const withoutDropped = html.replace(DROPPED_ELEMENTS, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const withBreaks = withoutDropped.replace(BLOCK_TAGS, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');

  return decodeEntities(stripped)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * Every page on these sites repeats the same navigation and footer. Left in,
 * that boilerplate dominates the term statistics and every query retrieves the
 * menu instead of the procedure. Dropping lines that recur across the corpus
 * is a cheap, corpus-derived alternative to maintaining per-site selectors.
 */
export function dropRepeatedLines(documents: readonly string[], minOccurrences = 3): string[] {
  const counts = new Map<string, number>();
  for (const document of documents) {
    for (const line of new Set(document.split('\n'))) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }

  return documents.map((document) =>
    document
      .split('\n')
      .filter((line) => {
        // Long lines are prose even if they repeat; only short, menu-like lines
        // are worth discarding on a repetition signal alone.
        if (line.length > 120) return true;
        return (counts.get(line) ?? 0) < minOccurrences;
      })
      .join('\n'),
  );
}

export interface Chunk {
  readonly index: number;
  readonly text: string;
}

export interface ChunkOptions {
  /** Target characters per chunk. */
  readonly size?: number;
  /** Characters of trailing context repeated into the next chunk. */
  readonly overlap?: number;
}

/**
 * Splits on line boundaries rather than a fixed character stride, so a required
 * document or a numbered step is not cut in half and made unquotable. Overlap
 * keeps a requirement attached to the heading above it when the two land either
 * side of a boundary.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const size = options.size ?? 1200;
  const overlap = options.overlap ?? 200;

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let length = 0;

  const flush = (): void => {
    if (buffer.length === 0) return;
    const body = buffer.join('\n').trim();
    if (body.length > 0) {
      chunks.push({ index: chunks.length, text: body });
    }
  };

  for (const line of lines) {
    // A single line longer than the target still becomes its own chunk rather
    // than being split mid-sentence.
    if (length > 0 && length + line.length + 1 > size) {
      flush();
      const carried: string[] = [];
      let carriedLength = 0;
      for (let i = buffer.length - 1; i >= 0 && carriedLength < overlap; i -= 1) {
        const previous = buffer[i] as string;
        carried.unshift(previous);
        carriedLength += previous.length + 1;
      }
      buffer = carried;
      length = carriedLength;
    }
    buffer.push(line);
    length += line.length + 1;
  }
  flush();

  return chunks;
}
