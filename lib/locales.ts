/**
 * The single source of truth for supported locales.
 *
 * Kept dependency-free so it can be imported by `proxy.ts`, the Zod knowledge
 * schema, and client components alike without dragging anything else along.
 */
export const LOCALES = ['en', 'am'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Amharic uses the Ge'ez script, which is written left to right. */
export const LOCALE_DIRECTION: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  am: 'ltr',
};

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  am: 'አማርኛ',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
