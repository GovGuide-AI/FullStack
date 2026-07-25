'use client';

import { Loader2, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { AskResult } from '@/components/ask/ask-result';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  MAX_QUESTION_LENGTH,
  type AskErrorCode,
  type AskErrorResponse,
  type AskResponse,
  type Clarification,
} from '@/lib/ask/contract';
import type { Locale } from '@/lib/locales';

type Status = 'idle' | 'loading' | 'done' | 'error';

const ERROR_MESSAGE_KEY: Record<AskErrorCode, string> = {
  'invalid-request': 'errors.empty',
  'rate-limited': 'errors.rateLimited',
  unavailable: 'errors.unavailable',
};

export function AskForm() {
  const t = useTranslations('ask');
  const locale = useLocale() as Locale;
  const fieldId = useId();
  const errorId = useId();

  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);
  /**
   * The question behind the current result. A clarifying reply has to be sent
   * with it, since the server keeps no memory of what was asked.
   */
  const [askedQuestion, setAskedQuestion] = useState('');

  // Lets a second submission cancel a slow first one instead of racing it.
  const inFlight = useRef<AbortController | null>(null);

  async function runAsk(payload: { question: string; clarification?: Clarification }) {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setStatus('loading');
    setErrorKey(null);
    setResult(null);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, locale }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as AskErrorResponse | null;
        setStatus('error');
        setErrorKey(body ? ERROR_MESSAGE_KEY[body.error] : 'errors.failed');
        return;
      }

      setResult((await response.json()) as AskResponse);
      setStatus('done');
    } catch {
      // An abort is a newer submission superseding this one, not a failure.
      if (controller.signal.aborted) return;
      setStatus('error');
      setErrorKey('errors.failed');
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = question.trim();
    if (trimmed.length === 0) {
      setStatus('error');
      setErrorKey('errors.empty');
      return;
    }
    if (trimmed.length > MAX_QUESTION_LENGTH) {
      setStatus('error');
      setErrorKey('errors.tooLong');
      return;
    }

    setAskedQuestion(trimmed);
    await runAsk({ question: trimmed });
  }

  function handleClarify(answer: string) {
    if (result?.kind !== 'clarify' || askedQuestion.length === 0) return;

    void runAsk({
      question: askedQuestion,
      clarification: { question: result.question, answer },
    });
  }

  const isLoading = status === 'loading';

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor={fieldId} className="sr-only">
          {t('label')}
        </label>
        <Textarea
          id={fieldId}
          name="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t('placeholder')}
          rows={3}
          maxLength={MAX_QUESTION_LENGTH}
          aria-invalid={status === 'error'}
          aria-describedby={errorKey ? errorId : undefined}
          className="resize-y"
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Search aria-hidden="true" className="size-4" />
            )}
            {isLoading ? t('submitting') : t('submit')}
          </Button>

          {question.length > 0 && !isLoading ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuestion('');
                setAskedQuestion('');
                setResult(null);
                setStatus('idle');
                setErrorKey(null);
              }}
            >
              {t('clear')}
            </Button>
          ) : null}
        </div>

        {errorKey ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {t(errorKey, { max: MAX_QUESTION_LENGTH })}
          </p>
        ) : null}
      </form>

      {/* Announced politely so a screen reader hears the answer arrive. */}
      <div aria-live="polite" aria-busy={isLoading}>
        {isLoading ? <AskPending /> : null}
        {status === 'done' && result ? (
          <AskResult result={result} onClarify={handleClarify} isLoading={isLoading} />
        ) : null}
      </div>
    </div>
  );
}

function AskPending() {
  const t = useTranslations('ask');
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      {t('submitting')}
    </p>
  );
}
