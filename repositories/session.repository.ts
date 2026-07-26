import 'server-only';
import { sql } from 'drizzle-orm';
import { sessions } from '@/db/schema';
import type { Locale } from '@/lib/locales';
import { withDb } from './with-db';

/**
 * Creates the session row if it does not exist yet.
 *
 * The cookie is issued by `proxy.ts` on the first page view, but the row is
 * only written once there is something to attach to it. That keeps a crawler
 * hitting every page from filling the table with empty sessions.
 */
export async function ensureSession(sessionId: string, locale: Locale): Promise<boolean> {
  return withDb(
    'ensureSession',
    async (db) => {
      await db
        .insert(sessions)
        .values({ id: sessionId, locale })
        .onConflictDoUpdate({
          target: sessions.id,
          set: { lastSeenAt: sql`now()`, locale },
        });
      return true;
    },
    false,
  );
}
