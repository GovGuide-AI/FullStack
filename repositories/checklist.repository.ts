import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { savedChecklists } from '@/db/schema';
import { withDb } from './with-db';

/** Every query is scoped by `sessionId`; there is no cross-session read path. */
export async function getCheckedItems(
  sessionId: string,
  serviceSlug: string,
): Promise<string[]> {
  return withDb(
    'getCheckedItems',
    async (db) => {
      const rows = await db
        .select({ checkedItemIds: savedChecklists.checkedItemIds })
        .from(savedChecklists)
        .where(
          and(
            eq(savedChecklists.sessionId, sessionId),
            eq(savedChecklists.serviceSlug, serviceSlug),
          ),
        )
        .limit(1);

      return rows[0]?.checkedItemIds ?? [];
    },
    [],
  );
}

export async function saveCheckedItems(
  sessionId: string,
  serviceSlug: string,
  checkedItemIds: string[],
): Promise<boolean> {
  return withDb(
    'saveCheckedItems',
    async (db) => {
      await db
        .insert(savedChecklists)
        .values({ sessionId, serviceSlug, checkedItemIds })
        .onConflictDoUpdate({
          target: [savedChecklists.sessionId, savedChecklists.serviceSlug],
          set: { checkedItemIds, updatedAt: sql`now()` },
        });
      return true;
    },
    false,
  );
}
