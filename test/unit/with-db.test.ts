import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@/db';

const getDb = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({ getDb }));

const { withDb } = await import('@/repositories/with-db');

/** Enough of a Database to satisfy the type; the callback decides what happens. */
const fakeDb = {} as Database;

describe('withDb', () => {
  beforeEach(() => {
    getDb.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the query result when the database is reachable', async () => {
    getDb.mockReturnValue(fakeDb);

    await expect(withDb('read', async () => 'value', 'fallback')).resolves.toBe('value');
  });

  it('returns the fallback without running the query when there is no database', async () => {
    getDb.mockReturnValue(null);
    const query = vi.fn();

    await expect(withDb('read', query, 'fallback')).resolves.toBe('fallback');
    expect(query).not.toHaveBeenCalled();
  });

  it('swallows a query failure and returns the fallback', async () => {
    getDb.mockReturnValue(fakeDb);

    await expect(
      withDb(
        'read',
        async () => {
          throw new Error('connection terminated unexpectedly');
        },
        [],
      ),
    ).resolves.toEqual([]);
  });

  it('logs the failing operation so an outage is diagnosable', async () => {
    getDb.mockReturnValue(fakeDb);
    const failure = new Error('too many connections');

    await withDb(
      'saveCheckedItems',
      async () => {
        throw failure;
      },
      false,
    );

    expect(console.error).toHaveBeenCalledWith('[db] saveCheckedItems failed:', failure);
  });
});
