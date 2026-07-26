'use client';

import { ArrowRight, HelpCircle, Info, Loader2, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { AnswerFeedback } from '@/components/ask/answer-feedback';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { VerificationBanner } from '@/components/service/verification-banner';
import { Link } from '@/i18n/navigation';
import {
  MAX_QUESTION_LENGTH,
  type AskResponse,
  type ServiceSuggestion,
} from '@/lib/ask/contract';

export function AskResult({
  result,
  onClarify,
  isLoading = false,
}: {
  result: AskResponse;
  /** Sends the user's reply to a clarifying question back for another routing pass. */
  onClarify?: (answer: string) => void;
  isLoading?: boolean;
}) {
  const t = useTranslations('result');

  if (result.kind === 'not-covered') {
    return (
      <Alert>
        <SearchX aria-hidden="true" className="size-4" />
        <AlertTitle>{t('notCovered.title')}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{t('notCovered.body')}</p>
          {result.suggestions.length > 0 ? (
            <SuggestionList label={t('notCovered.nearby')} suggestions={result.suggestions} />
          ) : null}
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
        <AlertDescription className="space-y-3">
          <p className="text-foreground">{result.question}</p>
          {result.options.length > 0 ? (
            <SuggestionList label={t('clarify.options')} suggestions={result.options} />
          ) : null}
          {onClarify ? (
            <ClarifyReply onSubmit={onClarify} isLoading={isLoading} />
          ) : (
            <p>{t('clarify.hint')}</p>
          )}
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

/**
 * Near misses, as links to the record rather than another routing pass.
 *
 * Tapping one is instant and deterministic. Sending the choice back through the
 * model would cost another 20-40s and re-open the very ambiguity the user has
 * just settled, so the chips bypass it entirely.
 */
function SuggestionList({
  label,
  suggestions,
}: {
  label: string;
  suggestions: readonly ServiceSuggestion[];
}) {
  const categories = useTranslations('categories');

  return (
    <div className="space-y-2">
      <p>{label}</p>
      <ul className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion.slug}>
            <Link
              href={`/services/${suggestion.slug}`}
              className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span>{suggestion.title}</span>
              <span className="text-xs text-muted-foreground">
                {categories(suggestion.category)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClarifyReply({
  onSubmit,
  isLoading,
}: {
  onSubmit: (answer: string) => void;
  isLoading: boolean;
}) {
  const t = useTranslations('result');
  const fieldId = useId();
  const [answer, setAnswer] = useState('');

  const trimmed = answer.trim();

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed.length === 0 || isLoading) return;
        onSubmit(trimmed);
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        {t('clarify.replyLabel')}
      </label>
      <Input
        id={fieldId}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder={t('clarify.replyPlaceholder')}
        maxLength={MAX_QUESTION_LENGTH}
        autoComplete="off"
        className="bg-background"
      />
      <Button type="submit" disabled={trimmed.length === 0 || isLoading}>
        {isLoading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
        {t('clarify.replySubmit')}
      </Button>
    </form>
  );
}
