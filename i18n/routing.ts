import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/locales';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  /**
   * `always` keeps the locale in the URL even for English. A shared link then
   * carries its language with it, which matters when someone forwards guidance
   * to a family member who reads the other language.
   */
  localePrefix: 'always',
});
