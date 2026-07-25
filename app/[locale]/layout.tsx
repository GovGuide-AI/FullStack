import { notFound } from 'next/navigation';
import { Geist, Noto_Sans_Ethiopic } from 'next/font/google';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { routing } from '@/i18n/routing';
import { LOCALE_DIRECTION } from '@/lib/locales';
import { cn } from '@/lib/utils';
import '../globals.css';

const latin = Geist({
  subsets: ['latin'],
  variable: '--font-latin',
  display: 'swap',
});

/**
 * Amharic is written in the Ge'ez script, which Geist does not cover. Without
 * this the entire Amharic UI would fall back to whatever the OS happens to have.
 */
const ethiopic = Noto_Sans_Ethiopic({
  subsets: ['ethiopic'],
  variable: '--font-ethiopic',
  display: 'swap',
});

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });

  return {
    title: {
      default: `${t('name')} — ${t('tagline')}`,
      template: `%s — ${t('name')}`,
    },
    description: t('tagline'),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // The `[locale]` segment catches every unmatched path, so an unknown value
  // here means a genuinely missing page rather than a missing translation.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  const fontStack =
    locale === 'am'
      ? 'var(--font-ethiopic), var(--font-latin), sans-serif'
      : 'var(--font-latin), var(--font-ethiopic), sans-serif';

  return (
    <html
      lang={locale}
      dir={LOCALE_DIRECTION[locale]}
      className={cn(latin.variable, ethiopic.variable)}
      style={{ '--font-sans': fontStack } as CSSProperties}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col antialiased">
        <NextIntlClientProvider messages={messages}>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
