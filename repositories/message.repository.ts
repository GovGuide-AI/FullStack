import 'server-only';
import { messages, type AskOutcome } from '@/db/schema';
import { withDb } from './with-db';

export interface ExchangeRecord {
  readonly sessionId: string;
  readonly question: string;
  readonly answer: string;
  readonly serviceSlug: string | null;
  readonly outcome: AskOutcome;
}

/**
 * Stores a question and its response for analytics on what people actually ask.
 *
 * The most valuable output of this table is the list of questions that returned
 * `not-covered`: that is a ranked backlog of which service to research next.
 */
export async function recordExchange(exchange: ExchangeRecord): Promise<boolean> {
  return withDb(
    'recordExchange',
    async (db) => {
      await db.insert(messages).values([
        {
          sessionId: exchange.sessionId,
          role: 'user',
          content: exchange.question,
          serviceSlug: exchange.serviceSlug,
          outcome: exchange.outcome,
        },
        {
          sessionId: exchange.sessionId,
          role: 'assistant',
          content: exchange.answer,
          serviceSlug: exchange.serviceSlug,
          outcome: exchange.outcome,
        },
      ]);
      return true;
    },
    false,
  );
}
