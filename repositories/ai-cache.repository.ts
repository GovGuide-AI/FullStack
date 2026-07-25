import 'server-only';
import { and, eq, gt, lt } from 'drizzle-orm';
import { aiCache, type AiCacheKind } from '@/db/schema';
import { withDb } from './with-db';

export async function readCachedPayload(key: string): Promise<unknown | null> {
  return withDb(
    'readCachedPayload',
    async (db) => {
      const rows = await db
        .select({ payload: aiCache.payload })
        .from(aiCache)
        .where(and(eq(aiCache.key, key), gt(aiCache.expiresAt, new Date())))
        .limit(1);

      return rows[0]?.payload ?? null;
    },
    null,
  );
}

export async function writeCachedPayload(input: {
  key: string;
  kind: AiCacheKind;
  model: string;
  payload: unknown;
  ttlSeconds: number;
}): Promise<boolean> {
  return withDb(
    'writeCachedPayload',
    async (db) => {
      const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
      await db
        .insert(aiCache)
        .values({
          key: input.key,
          kind: input.kind,
          model: input.model,
          payload: input.payload,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: aiCache.key,
          set: { payload: input.payload, model: input.model, expiresAt },
        });
      return true;
    },
    false,
  );
}

export async function purgeExpiredCache(): Promise<number> {
  return withDb(
    'purgeExpiredCache',
    async (db) => {
      const deleted = await db.delete(aiCache).where(lt(aiCache.expiresAt, new Date()));
      return deleted.length;
    },
    0,
  );
}
