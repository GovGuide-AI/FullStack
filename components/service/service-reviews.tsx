import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ReviewFlagButton } from '@/components/service/review-flag-button';
import { ReviewForm } from '@/components/service/review-form';
import { Badge } from '@/components/ui/badge';
import type { Locale } from '@/lib/locales';
import type { PublishedReview } from '@/repositories/review.repository';

interface ServiceReviewsProps {
  readonly serviceSlug: string;
  readonly locale: Locale;
  readonly reviews: readonly PublishedReview[];
}

const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-ET',
  am: 'am-ET',
};

/**
 * The community lane.
 *
 * Everything here was typed by a member of the public and is worth reading, but
 * it is not knowledge this project stands behind. The section therefore sits
 * below the whole verified record, is boxed off from it, and says plainly that
 * the official steps win when the two disagree. Nothing in this component is
 * ever passed to the model.
 */
export function ServiceReviews({ serviceSlug, locale, reviews }: ServiceReviewsProps) {
  const t = useTranslations('reviews');
  const tWait = useTranslations('reviews.waitTimes');
  const tOutcome = useTranslations('reviews.outcomes');

  return (
    <section className="space-y-4 rounded-lg border border-dashed bg-muted/40 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Users aria-hidden="true" className="size-4" />
          {t('heading')}
        </h2>
        {reviews.length > 0 ? (
          <p className="text-sm text-muted-foreground">{t('count', { count: reviews.length })}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">{t('unverifiedTitle')}</p>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          {t('unverifiedBody')}
        </p>
      </div>

      <ReviewForm serviceSlug={serviceSlug} />

      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((review) => (
            <li key={review.id} className="space-y-2 rounded-lg border bg-background p-4">
              <p className="text-pretty whitespace-pre-line">{review.body}</p>

              <div className="flex flex-wrap items-center gap-2">
                {review.details.officeVisited ? (
                  <Badge variant="secondary">{review.details.officeVisited}</Badge>
                ) : null}
                {review.details.waitTime ? (
                  <Badge variant="secondary">{tWait(review.details.waitTime)}</Badge>
                ) : null}
                {review.details.outcome ? (
                  <Badge variant="secondary">{tOutcome(review.details.outcome)}</Badge>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  <time dateTime={review.createdAt.toISOString()}>
                    {formatReviewDate(review.createdAt, locale)}
                  </time>
                  {/* Shown only when the report is in the other language, so a
                      reader knows why it does not match the rest of the page. */}
                  {review.locale !== locale
                    ? ` · ${t('writtenIn', { language: t(`languages.${review.locale}`) })}`
                    : ''}
                </p>
                <ReviewFlagButton reviewId={review.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatReviewDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
