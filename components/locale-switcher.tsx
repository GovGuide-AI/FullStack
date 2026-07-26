'use client';

import { Check, Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/locales';

export function LocaleSwitcher() {
  const t = useTranslations('nav');
  const activeLocale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function selectLocale(nextLocale: Locale) {
    if (nextLocale === activeLocale) return;
    startTransition(() => {
      // `usePathname` returns the path without its locale prefix, so switching
      // language from a service page stays on that same service.
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('changeLanguage')}
          disabled={isPending}
          className="gap-2"
        >
          <Globe aria-hidden="true" className="size-4" />
          <span>{LOCALE_LABELS[activeLocale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onSelect={() => selectLocale(locale)}
            className="gap-2"
            lang={locale}
          >
            <Check
              aria-hidden="true"
              className={locale === activeLocale ? 'size-4 opacity-100' : 'size-4 opacity-0'}
            />
            {LOCALE_LABELS[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
