import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit and blocks the next one', () => {
    const key = `key-${Math.random()}`;

    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit(key, 3, 60).allowed).toBe(true);
    }

    const blocked = checkRateLimit(key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('starts a fresh window once the old one expires', () => {
    const key = `key-${Math.random()}`;

    checkRateLimit(key, 1, 60);
    expect(checkRateLimit(key, 1, 60).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect(checkRateLimit(key, 1, 60).allowed).toBe(true);
  });

  it('tracks each key independently', () => {
    const first = `key-${Math.random()}`;
    const second = `key-${Math.random()}`;

    checkRateLimit(first, 1, 60);
    expect(checkRateLimit(first, 1, 60).allowed).toBe(false);
    expect(checkRateLimit(second, 1, 60).allowed).toBe(true);
  });
});
