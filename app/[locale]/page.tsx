import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AskForm } from '@/components/ask/ask-form';
import { Link } from '@/i18n/navigation';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('ask');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {t('heading')}
      </h1>
      <p className="mt-3 max-w-prose text-pretty text-muted-foreground">{t('subheading')}</p>

      <div className="mt-8">
        <AskForm />
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        <Link href="/services" className="underline underline-offset-4 hover:text-foreground">
          {t('examplesLabel')}
        </Link>
      </p>
    </div>
  );
}
