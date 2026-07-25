import 'server-only';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Reused across hot reloads in development, where module state is discarded on
 * every edit and a fresh pool each time would exhaust Postgres connections.
 */
const globalForDb = globalThis as unknown as {
  govguideSql?: ReturnType<typeof postgres>;
  govguideDb?: Database;
};

/**
 * Returns `null` when `DATABASE_URL` is not configured. Persistence is optional
 * by design: a user must still be able to get guidance when the database is
 * unavailable, so every caller degrades rather than failing.
 */
export function getDb(): Database | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (globalForDb.govguideDb) return globalForDb.govguideDb;

  const sql = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Render's managed Postgres terminates plaintext connections.
    ssl: connectionString.includes('localhost') ? false : 'require',
  });

  const db = drizzle(sql, { schema });

  globalForDb.govguideSql = sql;
  globalForDb.govguideDb = db;

  return db;
}

export { schema };
