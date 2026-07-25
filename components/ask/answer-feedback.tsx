'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { submitFeedbackAction } from '@/actions/feedback.actions';
import { Button } from '@/components/ui/button';
import { isLocale } from '@/lib/locales';

export function AnswerFeedback({ serviceSlug }: { serviceSlug: string | null }) {
  const t = useTranslations('feedback');
  const locale = useLocale();
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function rate(rating: -1 | 1) {
    if (!isLocale(locale)) return;

    // Thanking the user immediately is honest here: the rating is advisory, and
    // whether it reached the database is not something they need to act on.
    setSubmitted(true);
    startTransition(async () => {
      await submitFeedbackAction({ serviceSlug, rating, locale });
    });
  }

  if (submitted) {
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {t('thanks')}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p id="feedback-prompt" className="text-sm text-muted-foreground">
        {t('prompt')}
      </p>
      <div className="flex gap-1" role="group" aria-labelledby="feedback-prompt">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => rate(1)}
        >
          <ThumbsUp aria-hidden="true" className="size-4" />
          {t('yes')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => rate(-1)}
        >
          <ThumbsDown aria-hidden="true" className="size-4" />
          {t('no')}
        </Button>
      </div>
    </div>
  );
}
