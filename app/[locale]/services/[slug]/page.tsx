import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { ServiceDetail } from '@/components/service/service-detail';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getKnowledgeBase, getService } from '@/lib/knowledge/loader';
import { toServiceView } from '@/lib/knowledge/view';
import { isLocale, type Locale } from '@/lib/locales';
import { readSessionId } from '@/lib/session.server';
import { getCheckedItems } from '@/repositories/checklist.repository';

export function generateStaticParams(): Array<{ locale: string; slug: string }> {
  return routing.locales.flatMap((locale) =>
    getKnowledgeBase().slugs.map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const service = getService(slug);

  if (!service || !isLocale(locale)) {
    return {};
  }

  return {
    title: service.title[locale],
    description: service.summary[locale],
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  if (!isLocale(locale)) {
    notFound();
  }

  const service = getService(slug);
  if (!service) {
    notFound();
  }

  const t = await getTranslations('service');

  // Reading the session makes this page dynamic, which is correct: a saved
  // checklist is per-visitor and must never be cached across sessions.
  const sessionId = await readSessionId();
  const initialCheckedIds = sessionId ? await getCheckedItems(sessionId, slug) : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('backToAsk')}
      </Link>

      <ServiceDetail
        service={toServiceView(service, locale as Locale)}
        locale={locale}
        initialCheckedIds={initialCheckedIds}
      />
    </div>
  );
}
