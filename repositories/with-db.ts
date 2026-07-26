import 'server-only';
import { getDb, type Database } from '@/db';

/**
 * Runs a query, falling back instead of throwing.
 *
 * Persistence in this app is a convenience, never a prerequisite: someone
 * standing in a queue needs the document checklist far more than they need
 * their tick marks saved. A missing or broken database therefore degrades the
 * feature rather than the page.
 *
 * Callers that must react to failure — such as the checklist save indicator —
 * use a `fallback` that is distinguishable from a successful result.
 */
export async function withDb<T>(
  operation: string,
  fn: (db: Database) => Promise<T>,
  fallback: T,
): Promise<T> {
  const db = getDb();
  if (!db) return fallback;

  try {
    return await fn(db);
  } catch (error) {
    console.error(`[db] ${operation} failed:`, error);
    return fallback;
  }
}
