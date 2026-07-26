import { useTranslations } from 'next-intl';

export function SiteFooter() {
  const t = useTranslations('footer');

  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <p className="text-sm text-balance text-muted-foreground">{t('disclaimer')}</p>
      </div>
    </footer>
  );
}
