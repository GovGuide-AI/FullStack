/**
 * Produces evidence bundles: the official passages most likely to describe a
 * topic, quoted verbatim with their source, for a human to write a curated
 * record from.
 *
 * The output is intentionally not a draft YAML record. Generating a record
 * shape would invite someone to accept it wholesale, which is precisely the
 * failure this project exists to avoid. A bundle is reading material: it tells
 * an author where to look, and leaves the writing to them.
 *
 *   npm run draft -- passport
 *   npm run draft -- "business registration" --limit 12
 *   npm run draft            # one bundle per topic in the registry
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Bm25Index } from '../lib/retrieval/bm25';
import { loadSourceRegistry } from '../lib/knowledge/sources';
import { readChunkIndex, MissingIndexError, type IndexedChunk } from '../lib/retrieval/store';

const DRAFTS_DIR = path.join(process.cwd(), 'knowledge', 'drafts');

function slugify(query: string): string {
  return (
    query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'query'
  );
}

function parseLimit(argv: readonly string[]): number {
  const flagIndex = argv.indexOf('--limit');
  if (flagIndex === -1) return 8;
  const value = Number.parseInt(argv[flagIndex + 1] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 8;
}

function renderBundle(query: string, hits: readonly { document: IndexedChunk; score: number }[]): string {
  const lines: string[] = [
    `# Evidence bundle: ${query}`,
    '',
    `Generated ${new Date().toISOString()} by \`npm run draft\`.`,
    '',
    'These are the highest-ranking passages from the registered sources. They are',
    'raw quotations, not guidance. To turn them into a service record:',
    '',
    '1. Open each source URL and read the passage in context — ranking is lexical,',
    '   so a passage can rank highly and still be about something else.',
    '2. Copy only what the source actually states. If a fee, office or deadline is',
    '   not written down here, leave it out of the record rather than inferring it.',
    '3. Note any disagreement between sources in `verification.note`.',
    '4. Leave `verification.verified: false` until a person has checked every field',
    '   against the source.',
    '',
  ];

  if (hits.length === 0) {
    lines.push('No passage matched. Either the topic is not covered by the registered');
    lines.push('sources, or the wording differs — try the terms the ministry itself uses.');
    lines.push('');
    return lines.join('\n');
  }

  const bySource = new Map<string, { url: string; publisher: string; title: string }>();
  for (const hit of hits) {
    bySource.set(hit.document.sourceId, {
      url: hit.document.url,
      publisher: hit.document.publisher,
      title: hit.document.sourceTitle,
    });
  }

  lines.push('## Sources cited below', '');
  for (const [id, source] of bySource) {
    lines.push(`- \`${id}\` — ${source.title} (${source.publisher})`);
    lines.push(`  ${source.url}`);
  }
  lines.push('');

  lines.push('## Passages', '');
  hits.forEach((hit, position) => {
    const laneWarning =
      hit.document.lane === 'community'
        ? ' — COMMUNITY LANE, not official truth, never cite as procedure'
        : '';
    lines.push(
      `### ${position + 1}. \`${hit.document.id}\` (score ${hit.score.toFixed(2)})${laneWarning}`,
    );
    lines.push('');
    lines.push(`Source: ${hit.document.sourceTitle} — ${hit.document.url}`);
    lines.push('');
    lines.push('```text');
    lines.push(hit.document.text);
    lines.push('```');
    lines.push('');
  });

  lines.push('## TODO_VERIFY', '');
  lines.push('- [ ] Every fact carried into the record appears verbatim in a passage above.');
  lines.push('- [ ] Amharic is quoted from the source, not machine-translated.');
  lines.push('- [ ] Contradictions between sources are recorded, not silently resolved.');
  lines.push('- [ ] `verification.sourceUrls` lists every source actually used.');
  lines.push('');

  return lines.join('\n');
}

function main(): void {
  const argv = process.argv.slice(2);
  const limit = parseLimit(argv);
  const queries = argv.filter(
    (argument, position) =>
      !argument.startsWith('--') && argv[position - 1] !== '--limit',
  );

  let index;
  try {
    index = readChunkIndex();
  } catch (error) {
    if (error instanceof MissingIndexError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const bm25 = new Bm25Index(index.chunks as IndexedChunk[]);

  const topics =
    queries.length > 0
      ? queries
      : [...new Set(loadSourceRegistry().sources.flatMap((source) => source.topics))];

  mkdirSync(DRAFTS_DIR, { recursive: true });

  console.log(`Drafting ${topics.length} bundle(s) over ${bm25.size} chunk(s)…\n`);

  for (const topic of topics) {
    const hits = bm25.search(topic, limit);
    const file = path.join(DRAFTS_DIR, `${slugify(topic)}.md`);
    writeFileSync(file, renderBundle(topic, hits), 'utf8');
    console.log(
      `  ${topic.padEnd(28)} ${String(hits.length).padStart(2)} passage(s) → ${path.relative(process.cwd(), file)}`,
    );
  }

  console.log('\nBundles are reading material for an author. Nothing here is a record yet.');
}

main();
