'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * Next.js 16 passes `unstable_retry` here; earlier versions called it `reset`.
 */
export default function LocaleError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  const t = useTranslations('states');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
      <AlertTriangle aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t('errorTitle')}</h1>
      <p className="mt-2 text-muted-foreground">{t('errorBody')}</p>
      <Button onClick={() => unstable_retry()} className="mt-6">
        {t('retry')}
      </Button>
    </div>
  );
}
