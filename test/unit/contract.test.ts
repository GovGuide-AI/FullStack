import { describe, expect, it } from 'vitest';
import { askRequestSchema, MAX_QUESTION_LENGTH } from '@/lib/ask/contract';

describe('askRequestSchema', () => {
  it('accepts a normal question and trims it', () => {
    const result = askRequestSchema.safeParse({
      question: '  how do I renew my passport  ',
      locale: 'en',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.question).toBe('how do I renew my passport');
  });

  it('accepts Amharic', () => {
    const result = askRequestSchema.safeParse({
      question: 'ፓስፖርቴን ማደስ እፈልጋለሁ',
      locale: 'am',
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '     '],
    ['tabs and newlines', '\t\n  \n'],
  ])('rejects %s', (_label, question) => {
    expect(askRequestSchema.safeParse({ question, locale: 'en' }).success).toBe(false);
  });

  it('rejects a question over the length limit', () => {
    const question = 'a'.repeat(MAX_QUESTION_LENGTH + 1);
    expect(askRequestSchema.safeParse({ question, locale: 'en' }).success).toBe(false);
  });

  it('accepts a question exactly at the length limit', () => {
    const question = 'a'.repeat(MAX_QUESTION_LENGTH);
    expect(askRequestSchema.safeParse({ question, locale: 'en' }).success).toBe(true);
  });

  it.each([
    ['unsupported locale', { question: 'hi', locale: 'fr' }],
    ['missing locale', { question: 'hi' }],
    ['missing question', { locale: 'en' }],
    ['wrong question type', { question: 42, locale: 'en' }],
    ['null body', null],
    ['array body', []],
  ])('rejects %s', (_label, body) => {
    expect(askRequestSchema.safeParse(body).success).toBe(false);
  });
});
