'use client';

import { Check, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { saveChecklistAction } from '@/actions/checklist.actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { DocumentView } from '@/lib/knowledge/view';

interface DocumentChecklistProps {
  readonly serviceSlug: string;
  readonly documents: readonly DocumentView[];
  readonly initialCheckedIds: readonly string[];
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export function DocumentChecklist({
  serviceSlug,
  documents,
  initialCheckedIds,
}: DocumentChecklistProps) {
  const t = useTranslations('checklist');
  const tService = useTranslations('service');
  const locale = useLocale();
  const headingId = useId();

  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(initialCheckedIds));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function toggle(itemId: string, isChecked: boolean) {
    const next = new Set(checked);
    if (isChecked) {
      next.add(itemId);
    } else {
      next.delete(itemId);
    }

    // Applied immediately. Persistence is a convenience, so the tick must never
    // wait on a round trip — or be lost if that round trip fails.
    setChecked(next);
    persist(next);
  }

  function persist(next: ReadonlySet<string>) {
    setSaveState('saving');
    startTransition(async () => {
      const result = await saveChecklistAction({
        serviceSlug,
        checkedItemIds: [...next],
        locale,
      });
      setSaveState(result.saved ? 'saved' : 'failed');
    });
  }

  function reset() {
    const empty = new Set<string>();
    setChecked(empty);
    persist(empty);
  }

  if (documents.length === 0) {
    return <p className="text-muted-foreground">{tService('noneRecorded')}</p>;
  }

  const doneCount = documents.filter((_, index) => checked.has(`documents.${index}`)).length;

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-medium">
          {tService('documents')}
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('progress', { done: doneCount, total: documents.length })}
        </p>
      </div>

      <ul className="space-y-3">
        {documents.map((document, index) => {
          const itemId = `documents.${index}`;
          const isChecked = checked.has(itemId);

          return (
            <li key={itemId} className="flex items-start gap-3">
              <Checkbox
                id={itemId}
                checked={isChecked}
                onCheckedChange={(value) => toggle(itemId, value === true)}
                className="mt-1"
              />
              <div className="space-y-1">
                <label
                  htmlFor={itemId}
                  className={
                    isChecked
                      ? 'cursor-pointer text-muted-foreground line-through'
                      : 'cursor-pointer'
                  }
                >
                  {document.name}
                </label>
                <p className="text-sm text-muted-foreground">
                  {document.required ? tService('required') : tService('optional')}
                  {document.copies !== null
                    ? ` · ${tService('copies', { count: document.copies })}`
                    : ''}
                </p>
                {document.notes ? (
                  <p className="text-sm text-muted-foreground">{document.notes}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        {doneCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            {t('reset')}
          </Button>
        ) : null}
        <SaveIndicator state={saveState} />
      </div>
    </section>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const t = useTranslations('checklist');

  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        {t('saving')}
      </span>
    );
  }

  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Check aria-hidden="true" className="size-3.5" />
        {t('saved')}
      </span>
    );
  }

  if (state === 'failed') {
    return (
      <span role="status" className="text-sm text-muted-foreground">
        {t('saveFailed')}
      </span>
    );
  }

  return null;
}
