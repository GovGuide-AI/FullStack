import type { FeeAmount, Locale } from './schema';

const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-ET',
  am: 'am-ET',
};

export function formatFeeAmount(amount: FeeAmount, locale: Locale): string {
  if (amount.kind === 'variable') {
    return amount.description[locale];
  }
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: amount.currency,
    maximumFractionDigits: 2,
  }).format(amount.value);
}

export function formatVerificationDate(isoDate: string, locale: Locale): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed);
}
