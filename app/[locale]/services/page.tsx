import { ArrowRight, ShieldAlert } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';
import { getCatalogByCategory } from '@/lib/knowledge/catalog';
import type { Locale } from '@/lib/locales';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'services' });
  return { title: t('heading') };
}

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('services');
  const tCategories = await getTranslations('categories');
  const tVerification = await getTranslations('verification');

  const grouped = getCatalogByCategory(locale as Locale);
  const total = [...grouped.values()].reduce((sum, entries) => sum + entries.length, 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
      <p className="mt-2 text-muted-foreground">{t('subheading')}</p>

      {total === 0 ? (
        <p className="mt-10 rounded-md border border-dashed px-4 py-8 text-center text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{t('count', { count: total })}</p>

          <div className="mt-10 space-y-10">
            {[...grouped.entries()].map(([category, entries]) => (
              <section key={category} className="space-y-4">
                <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
                  {tCategories(category)}
                </h2>
                <ul className="space-y-3">
                  {entries.map((entry) => (
                    <li key={entry.slug}>
                      <Link
                        href={`/services/${entry.slug}`}
                        className="group flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{entry.title[locale as Locale]}</span>
                            {!entry.verified ? (
                              <Badge variant="outline" className="gap-1">
                                <ShieldAlert aria-hidden="true" className="size-3" />
                                {tVerification('suppressed')}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-sm text-pretty text-muted-foreground">
                            {entry.summary[locale as Locale]}
                          </p>
                        </div>
                        <ArrowRight
                          aria-hidden="true"
                          className="mt-1 size-4 shrink-0 text-muted-foreground"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
