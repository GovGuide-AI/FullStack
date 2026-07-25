'use client';

import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { submitReviewAction, type ReviewErrorCode } from '@/actions/review.actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/lib/locales';
import {
  MAX_OFFICE_VISITED_LENGTH,
  MAX_REVIEW_BODY_LENGTH,
  MIN_REVIEW_BODY_LENGTH,
  REVIEW_OUTCOMES,
  WAIT_TIMES,
} from '@/lib/reviews/schema';

interface ReviewFormProps {
  readonly serviceSlug: string;
}

type FormState = 'idle' | 'submitting' | 'success';

const SELECT_CLASSES =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export function ReviewForm({ serviceSlug }: ReviewFormProps) {
  const t = useTranslations('reviews.form');
  const tWait = useTranslations('reviews.waitTimes');
  const tOutcome = useTranslations('reviews.outcomes');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const fieldId = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [body, setBody] = useState('');
  const [officeVisited, setOfficeVisited] = useState('');
  const [waitTime, setWaitTime] = useState('');
  const [outcome, setOutcome] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [error, setError] = useState<ReviewErrorCode | null>(null);
  const [, startTransition] = useTransition();

  const trimmedLength = body.trim().length;
  const canSubmit =
    state !== 'submitting' &&
    trimmedLength >= MIN_REVIEW_BODY_LENGTH &&
    trimmedLength <= MAX_REVIEW_BODY_LENGTH;

  function submit() {
    setState('submitting');
    setError(null);

    startTransition(async () => {
      const result = await submitReviewAction({
        serviceSlug,
        locale,
        body,
        details: { officeVisited, waitTime, outcome },
      });

      if (!result.submitted) {
        setState('idle');
        setError(result.error);
        return;
      }

      setState('success');
      setBody('');
      setOfficeVisited('');
      setWaitTime('');
      setOutcome('');
      setIsOpen(false);
      // The list is server-rendered, so the new report only appears once the
      // server component runs again.
      router.refresh();
    });
  }

  if (!isOpen) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(true)}>
          {t('open')}
        </Button>
        {state === 'success' ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('success')}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-4 rounded-lg border bg-background p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) submit();
      }}
    >
      <div className="space-y-1">
        <h3 className="font-medium">{t('heading')}</h3>
        <p className="text-sm text-muted-foreground">{t('hint')}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${fieldId}-body`} className="text-sm font-medium">
          {t('bodyLabel')}
        </label>
        <Textarea
          id={`${fieldId}-body`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t('bodyPlaceholder')}
          maxLength={MAX_REVIEW_BODY_LENGTH}
          rows={4}
          required
        />
        <p className="text-sm text-muted-foreground">
          {t('bodyCounter', { count: trimmedLength, max: MAX_REVIEW_BODY_LENGTH })}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${fieldId}-office`} className="text-sm font-medium">
          {t('officeLabel')}
        </label>
        <Input
          id={`${fieldId}-office`}
          value={officeVisited}
          onChange={(event) => setOfficeVisited(event.target.value)}
          placeholder={t('officePlaceholder')}
          maxLength={MAX_OFFICE_VISITED_LENGTH}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${fieldId}-wait`} className="text-sm font-medium">
            {t('waitTimeLabel')}
          </label>
          <select
            id={`${fieldId}-wait`}
            className={SELECT_CLASSES}
            value={waitTime}
            onChange={(event) => setWaitTime(event.target.value)}
          >
            <option value="">{t('unanswered')}</option>
            {WAIT_TIMES.map((value) => (
              <option key={value} value={value}>
                {tWait(value)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${fieldId}-outcome`} className="text-sm font-medium">
            {t('outcomeLabel')}
          </label>
          <select
            id={`${fieldId}-outcome`}
            className={SELECT_CLASSES}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          >
            <option value="">{t('unanswered')}</option>
            {REVIEW_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {tOutcome(value)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error === 'invalid'
            ? t('errors.invalid', {
                min: MIN_REVIEW_BODY_LENGTH,
                max: MAX_REVIEW_BODY_LENGTH,
              })
            : t(`errors.${error}`)}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {state === 'submitting' ? (
            <>
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              {t('submitting')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
