import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import {
  createSessionId,
  isValidSessionId,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './lib/session';

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy`, and the
 * exported function with it. This runs on the Node.js runtime, which is fixed.
 */
const handleLocale = createMiddleware(routing);

export function proxy(request: NextRequest) {
  const response = handleLocale(request);

  // Cookies cannot be set while a Server Component renders, so the anonymous
  // session id is issued here — the first point in the request where a
  // `Set-Cookie` header is still possible.
  const existing = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSessionId(existing)) {
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionId(),
      sessionCookieOptions(request.nextUrl.protocol === 'https:'),
    );
  }

  return response;
}

export const config = {
  // Skip API routes, Next internals, and anything with a file extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
