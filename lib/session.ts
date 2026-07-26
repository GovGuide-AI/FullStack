/**
 * Anonymous session identity.
 *
 * There are no accounts. A session is an opaque UUID in an httpOnly cookie,
 * which is enough to remember a checklist without ever asking someone for a
 * name, phone number, or anything else a government-services site has no
 * business collecting.
 *
 * Kept free of `next/headers` so `proxy.ts` can import it too.
 */
export const SESSION_COOKIE_NAME = 'ggid';

/** Long enough that a paused application is still there next week. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function createSessionId(): string {
  return crypto.randomUUID();
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
  secure: boolean;
}

export function sessionCookieOptions(secure: boolean): SessionCookieOptions {
  return {
    // Not readable from JavaScript: the id is never needed in the browser.
    httpOnly: true,
    // `lax` still sends the cookie on top-level navigation, so a shared link works.
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    secure,
  };
}
