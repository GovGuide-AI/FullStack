import { NextResponse } from 'next/server';
import { AiUnavailableError } from '@/lib/ai/errors';
import { askRequestSchema, type AskErrorResponse, type AskResponse } from '@/lib/ask/contract';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  createSessionId,
  isValidSessionId,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '@/lib/session';
import { recordExchange } from '@/repositories/message.repository';
import { ensureSession } from '@/repositories/session.repository';
import { askGuidance } from '@/services/guidance.service';

/** Each question costs a model call, so the window is deliberately tight. */
const RATE_LIMIT_REQUESTS = 12;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function errorResponse(error: AskErrorResponse['error'], status: number, headers?: HeadersInit) {
  return NextResponse.json<AskErrorResponse>({ error }, { status, headers });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid-request', 400);
  }

  const parsed = askRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('invalid-request', 400);
  }

  // The proxy issues this cookie on the first page view. A direct API call that
  // never loaded a page gets one minted here instead.
  const existingSessionId = readSessionCookie(request);
  const sessionId = existingSessionId ?? createSessionId();

  const limit = checkRateLimit(`ask:${sessionId}`, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS);
  if (!limit.allowed) {
    return errorResponse('rate-limited', 429, {
      'retry-after': String(limit.retryAfterSeconds),
    });
  }

  let result: AskResponse;
  try {
    result = await askGuidance({
      question: parsed.data.question,
      locale: parsed.data.locale,
      clarification: parsed.data.clarification,
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      console.error('[api/ask] routing unavailable:', error.cause);
      return errorResponse('unavailable', 503);
    }
    console.error('[api/ask] unexpected failure:', error);
    return errorResponse('unavailable', 503);
  }

  // Persistence is best-effort and must never fail the request; the caller
  // already has their answer by this point.
  void persistExchange(sessionId, parsed.data.locale, parsed.data.question, result).catch(
    (error: unknown) => {
      console.error('[api/ask] persistence failed:', error);
    },
  );

  const response = NextResponse.json<AskResponse>(result);

  if (!existingSessionId) {
    const isHttps = new URL(request.url).protocol === 'https:';
    response.cookies.set(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions(isHttps));
  }

  return response;
}

function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      const value = decodeURIComponent(rest.join('='));
      return isValidSessionId(value) ? value : null;
    }
  }

  return null;
}

async function persistExchange(
  sessionId: string,
  locale: 'en' | 'am',
  question: string,
  result: AskResponse,
): Promise<void> {
  const created = await ensureSession(sessionId, locale);
  if (!created) return;

  const answer =
    result.kind === 'answer'
      ? (result.explanation ?? result.service.title)
      : result.kind === 'clarify'
        ? result.question
        : 'not-covered';

  await recordExchange({
    sessionId,
    question,
    answer,
    serviceSlug: result.kind === 'answer' ? result.service.slug : null,
    outcome: result.kind,
  });
}
