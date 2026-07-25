import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function LocaleNotFound() {
  const t = useTranslations('states');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
      <p className="mt-2 text-muted-foreground">{t('notFoundBody')}</p>
      <Button asChild className="mt-6">
        <Link href="/">{t('backHome')}</Link>
      </Button>
    </div>
  );
}
