'use client';

import { ArrowRight, HelpCircle, Info, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AnswerFeedback } from '@/components/ask/answer-feedback';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VerificationBanner } from '@/components/service/verification-banner';
import { Link } from '@/i18n/navigation';
import type { AskResponse } from '@/lib/ask/contract';

export function AskResult({ result }: { result: AskResponse }) {
  const t = useTranslations('result');

  if (result.kind === 'not-covered') {
    return (
      <Alert>
        <SearchX aria-hidden="true" className="size-4" />
        <AlertTitle>{t('notCovered.title')}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{t('notCovered.body')}</p>
          <Link href="/services" className="underline underline-offset-4">
            {t('notCovered.browse')}
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (result.kind === 'clarify') {
    return (
      <Alert>
        <HelpCircle aria-hidden="true" className="size-4" />
        <AlertTitle>{t('clarify.title')}</AlertTitle>
        <AlertDescription className="space-y-2">
          <p className="text-foreground">{result.question}</p>
          <p>{t('clarify.hint')}</p>
        </AlertDescription>
      </Alert>
    );
  }

  const { service, explanation, citations, grounded } = result;

  return (
    <Card>
      <CardHeader>
        <p className="text-sm text-muted-foreground">{t('matchedLabel')}</p>
        <CardTitle className="text-xl">{service.title}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <VerificationBanner verified={service.verified} />

        {explanation ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('explanationLabel')}</h3>
            <p className="text-pretty">{explanation}</p>
          </div>
        ) : (
          <Alert>
            <Info aria-hidden="true" className="size-4" />
            <AlertDescription>{t('ungrounded')}</AlertDescription>
          </Alert>
        )}

        {grounded && citations.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t('basedOn', { count: citations.length })}
            </h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {citations.map((citation) => (
                <li key={citation.id} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{citation.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button asChild variant="secondary">
          <Link href={`/services/${service.slug}`}>
            {t('viewFullGuide')}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>

        <AnswerFeedback serviceSlug={service.slug} />
      </CardContent>
    </Card>
  );
}
