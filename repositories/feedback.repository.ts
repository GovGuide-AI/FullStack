import 'server-only';
import { feedback } from '@/db/schema';
import { withDb } from './with-db';

export async function submitFeedback(input: {
  sessionId: string;
  serviceSlug: string | null;
  rating: -1 | 1;
  comment: string | null;
}): Promise<boolean> {
  return withDb(
    'submitFeedback',
    async (db) => {
      await db.insert(feedback).values(input);
      return true;
    },
    false,
  );
}
