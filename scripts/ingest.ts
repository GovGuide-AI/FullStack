/**
 * Fetches every registered source, extracts readable text, and writes a chunk
 * index for `npm run draft` to retrieve over.
 *
 * This is authoring tooling, not part of the request path. Nothing it produces
 * is served to a user or shown to the model: its only consumer is a human
 * deciding which official paragraphs to read before writing a curated record.
 * Failures are therefore reported and skipped rather than fatal — these sites
 * go down often, and one unreachable ministry should not block drafting the
 * other five.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { loadSourceRegistry, type Source } from '../lib/knowledge/sources';
import { chunkText, dropRepeatedLines, htmlToText } from '../lib/retrieval/text';
import { CHUNKS_FILE, INDEX_DIR, RAW_DIR, type IndexedChunk } from '../lib/retrieval/store';

const USER_AGENT = 'GovGuideAI-ingest/1.0 (+https://github.com/govguide-ai)';
const TIMEOUT_MS = 45_000;
const MAX_REDIRECTS = 5;

interface Fetched {
  readonly body: Buffer;
  readonly contentType: string;
}

/**
 * Used only for sources that declared `incompleteTlsChain`. Those hosts serve a
 * valid publicly-trusted leaf but omit the intermediate, so the chain cannot be
 * built. Skipping verification for them is a deliberate, per-source exception;
 * the ordinary path below keeps full verification.
 */
function fetchWithRelaxedTls(url: string, redirectsLeft = MAX_REDIRECTS): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { rejectUnauthorized: false, headers: { 'user-agent': USER_AGENT }, timeout: TIMEOUT_MS },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;

        if (status >= 300 && status < 400 && location !== undefined) {
          response.resume();
          if (redirectsLeft === 0) {
            reject(new Error('too many redirects'));
            return;
          }
          resolve(fetchWithRelaxedTls(new URL(location, url).toString(), redirectsLeft - 1));
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }

        const parts: Buffer[] = [];
        response.on('data', (part: Buffer) => parts.push(part));
        response.on('end', () =>
          resolve({
            body: Buffer.concat(parts),
            contentType: response.headers['content-type'] ?? '',
          }),
        );
        response.on('error', reject);
      },
    );

    request.on('timeout', () => request.destroy(new Error(`timed out after ${TIMEOUT_MS}ms`)));
    request.on('error', reject);
  });
}

async function fetchSource(source: Source): Promise<Fetched> {
  if (source.incompleteTlsChain) {
    return fetchWithRelaxedTls(source.url);
  }

  const response = await fetch(source.url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? '',
  };
}

async function pdfToText(body: Buffer): Promise<string> {
  // Imported lazily so that ingesting an HTML-only registry does not pay the
  // cost of loading pdfjs.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(body) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extract(source: Source, fetched: Fetched): Promise<string> {
  if (source.format === 'pdf') {
    return pdfToText(fetched.body);
  }
  return htmlToText(fetched.body.toString('utf8'));
}

interface Extracted {
  readonly source: Source;
  readonly text: string;
}

async function main(): Promise<void> {
  const only = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));
  const registry = loadSourceRegistry();
  const selected =
    only.length > 0
      ? registry.sources.filter((source) => only.includes(source.id))
      : registry.sources;

  if (selected.length === 0) {
    console.error(`No registered source matches: ${only.join(', ')}`);
    process.exit(1);
  }

  mkdirSync(RAW_DIR, { recursive: true });

  const extracted: Extracted[] = [];
  const failures: string[] = [];

  console.log(`Ingesting ${selected.length} source(s)…\n`);

  for (const source of selected) {
    process.stdout.write(`  ${source.id.padEnd(32)} `);
    try {
      const fetched = await fetchSource(source);
      const text = await extract(source, fetched);
      const trimmed = text.trim();

      if (trimmed.length === 0) {
        console.log('no extractable text (client-rendered or empty)');
        failures.push(`${source.id}: fetched but yielded no text`);
        continue;
      }

      writeFileSync(path.join(RAW_DIR, `${source.id}.txt`), trimmed, 'utf8');
      extracted.push({ source, text: trimmed });
      console.log(`${trimmed.length.toLocaleString()} chars`);
    } catch (error) {
      console.log(`FAILED — ${(error as Error).message}`);
      failures.push(`${source.id}: ${(error as Error).message}`);
    }
  }

  if (extracted.length === 0) {
    console.error('\nNothing was ingested; leaving any existing index untouched.');
    process.exit(1);
  }

  const cleaned = dropRepeatedLines(extracted.map((entry) => entry.text));

  const chunks: IndexedChunk[] = [];
  extracted.forEach((entry, documentIndex) => {
    const body = cleaned[documentIndex] as string;
    for (const chunk of chunkText(body)) {
      chunks.push({
        id: `${entry.source.id}#${chunk.index}`,
        sourceId: entry.source.id,
        sourceTitle: entry.source.title,
        publisher: entry.source.publisher,
        url: entry.source.url,
        lane: entry.source.lane,
        text: chunk.text,
      });
    }
  });

  mkdirSync(INDEX_DIR, { recursive: true });
  writeFileSync(
    CHUNKS_FILE,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), chunks }, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `\nIndexed ${chunks.length} chunk(s) from ${extracted.length} source(s) → ${path.relative(process.cwd(), CHUNKS_FILE)}`,
  );

  if (failures.length > 0) {
    console.warn(`\n  ! ${failures.length} source(s) produced nothing:`);
    for (const failure of failures) {
      console.warn(`    - ${failure}`);
    }
    console.warn('');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
