import 'server-only';
import { cookies } from 'next/headers';
import {
  createSessionId,
  isValidSessionId,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './session';

/**
 * Reads the session id issued by `proxy.ts`.
 *
 * Returns `null` rather than minting one, because Next.js forbids setting a
 * cookie during Server Component rendering. Callers that genuinely need an id
 * (Server Actions, Route Handlers) use `requireSessionId`.
 */
export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;
  return isValidSessionId(value) ? value : null;
}

/**
 * Returns the session id, minting one if the cookie is missing.
 *
 * Only callable from a Server Action or Route Handler — those are the contexts
 * where Next.js still permits a `Set-Cookie`.
 */
export async function requireSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE_NAME)?.value;
  if (isValidSessionId(existing)) return existing;

  const sessionId = createSessionId();
  store.set(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions(isProduction()));
  return sessionId;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
