import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link } from '@/i18n/navigation';
import logo from '@/public/logo.png';

export function SiteHeader() {
  const t = useTranslations();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        {t('app.skipToContent')}
      </a>
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 rounded-sm font-medium">
            {/* Decorative: the app name sits beside it as real text, so a label
                here would only make a screen reader say it twice. */}
            <Image src={logo} alt="" aria-hidden="true" className="h-7 w-auto" priority />
            <span>{t('app.name')}</span>
          </Link>
          <nav className="ms-auto flex items-center gap-1" aria-label={t('nav.mainLabel')}>
            <Link
              href="/services"
              className="rounded-sm px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {t('nav.services')}
            </Link>
            <LocaleSwitcher />
          </nav>
        </div>
      </header>
    </>
  );
}
