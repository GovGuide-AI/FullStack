import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Bm25Document } from './bm25';
import type { SourceLane } from '../knowledge/sources';

export const INDEX_DIR = path.join(process.cwd(), 'knowledge', '.index');
export const CHUNKS_FILE = path.join(INDEX_DIR, 'chunks.json');
export const RAW_DIR = path.join(INDEX_DIR, 'raw');

/**
 * A chunk carries its provenance rather than a foreign key into the registry.
 * An evidence bundle is read away from the tooling that produced it, so every
 * quoted passage has to name its own source without a lookup.
 */
export interface IndexedChunk extends Bm25Document {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly publisher: string;
  readonly url: string;
  readonly lane: SourceLane;
  readonly text: string;
}

export interface ChunkIndex {
  readonly generatedAt: string;
  readonly chunks: readonly IndexedChunk[];
}

export class MissingIndexError extends Error {
  constructor() {
    super(
      `No chunk index at ${CHUNKS_FILE}. Run "npm run ingest" first to fetch and chunk the registered sources.`,
    );
    this.name = 'MissingIndexError';
  }
}

export function readChunkIndex(): ChunkIndex {
  let raw: string;
  try {
    raw = readFileSync(CHUNKS_FILE, 'utf8');
  } catch {
    throw new MissingIndexError();
  }
  return JSON.parse(raw) as ChunkIndex;
}
