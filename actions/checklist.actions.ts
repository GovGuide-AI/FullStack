'use server';

import { z } from 'zod';
import { listCitationIds } from '@/lib/knowledge/citations';
import { getService } from '@/lib/knowledge/loader';
import { isLocale } from '@/lib/locales';
import { requireSessionId } from '@/lib/session.server';
import { getCheckedItems, saveCheckedItems } from '@/repositories/checklist.repository';
import { ensureSession } from '@/repositories/session.repository';

const saveChecklistSchema = z.object({
  serviceSlug: z.string().min(1).max(64),
  checkedItemIds: z.array(z.string().min(1).max(64)).max(200),
  locale: z.string().refine(isLocale, 'unsupported locale'),
});

export interface SaveChecklistResult {
  readonly saved: boolean;
}

/**
 * Persists which checklist items a visitor has ticked.
 *
 * A Server Action is a public HTTP endpoint, so the input is validated exactly
 * as strictly as a route handler's would be — including checking that each id
 * actually belongs to the service, which stops arbitrary strings being written
 * to the database.
 */
export async function saveChecklistAction(input: unknown): Promise<SaveChecklistResult> {
  const parsed = saveChecklistSchema.safeParse(input);
  if (!parsed.success) {
    return { saved: false };
  }

  const service = getService(parsed.data.serviceSlug);
  if (!service) {
    return { saved: false };
  }

  const allowedIds = new Set(listCitationIds(service));
  const checkedItemIds = parsed.data.checkedItemIds.filter((id) => allowedIds.has(id));

  const sessionId = await requireSessionId();

  const sessionReady = await ensureSession(sessionId, parsed.data.locale);
  if (!sessionReady) {
    // No database configured, or it is down. The UI keeps the ticks locally.
    return { saved: false };
  }

  const saved = await saveCheckedItems(sessionId, parsed.data.serviceSlug, checkedItemIds);
  return { saved };
}

export async function loadChecklistAction(serviceSlug: string): Promise<string[]> {
  const sessionId = await requireSessionId();
  return getCheckedItems(sessionId, serviceSlug);
}
