'use client';

import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function VerificationBanner({ verified }: { verified: boolean }) {
  const t = useTranslations('verification');

  if (verified) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="size-4" />
        {t('verified')}
      </p>
    );
  }

  return (
    <Alert variant="destructive">
      <ShieldAlert aria-hidden="true" className="size-4" />
      <AlertTitle>{t('unverifiedTitle')}</AlertTitle>
      <AlertDescription>{t('unverifiedBody')}</AlertDescription>
    </Alert>
  );
}
