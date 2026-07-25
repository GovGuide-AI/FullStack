'use client';

import { Flag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { flagReviewAction } from '@/actions/review.actions';
import { Button } from '@/components/ui/button';

interface ReviewFlagButtonProps {
  readonly reviewId: string;
}

type FlagState = 'idle' | 'sending' | 'flagged' | 'failed';

/**
 * Flagging is the only moderation this project has, so the control stays
 * visible on every report rather than hidden behind a menu. It never reveals
 * how many flags a report has: that number is what an organised group would
 * need in order to work out how close they are to burying something.
 */
export function ReviewFlagButton({ reviewId }: ReviewFlagButtonProps) {
  const t = useTranslations('reviews');
  const locale = useLocale();
  const [state, setState] = useState<FlagState>('idle');
  const [, startTransition] = useTransition();

  if (state === 'flagged') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('flagged')}
      </p>
    );
  }

  function flag() {
    setState('sending');
    startTransition(async () => {
      const result = await flagReviewAction({ reviewId, locale });
      setState(result.flagged ? 'flagged' : 'failed');
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={state === 'sending'}
        onClick={flag}
        className="text-muted-foreground"
      >
        <Flag aria-hidden="true" className="size-3.5" />
        {t('flag')}
      </Button>
      {state === 'failed' ? (
        <span role="alert" className="text-sm text-muted-foreground">
          {t('flagFailed')}
        </span>
      ) : null}
    </div>
  );
}
