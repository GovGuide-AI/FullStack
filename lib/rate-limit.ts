import 'server-only';

/**
 * A fixed-window rate limiter held in process memory.
 *
 * Limitation worth knowing: this is per-instance. The app deploys as a single
 * Render web service, so today that is the whole system, but scaling to more
 * than one instance would multiply the effective limit by the instance count.
 * A shared store would fix it; Redis is deliberately not a dependency here.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    // Cheap guard against unbounded growth from a flood of distinct keys.
    if (windows.size >= MAX_TRACKED_KEYS) {
      for (const [candidate, window] of windows) {
        if (window.resetAt <= now) windows.delete(candidate);
      }
    }

    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
