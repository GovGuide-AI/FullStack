import { describe, expect, it } from 'vitest';
import {
  MAX_REVIEW_BODY_LENGTH,
  MIN_REVIEW_BODY_LENGTH,
  reviewDetailsSchema,
  reviewSubmissionSchema,
} from '@/lib/reviews/schema';

const VALID_BODY =
  'The office asked for a copy of my lease that I did not know about, so I had to come back.';

function submission(overrides: Record<string, unknown> = {}) {
  return {
    serviceSlug: 'passport-renewal',
    locale: 'en',
    body: VALID_BODY,
    ...overrides,
  };
}

describe('review submission validation', () => {
  it('accepts a plain account with no details', () => {
    const result = reviewSubmissionSchema.safeParse(submission());

    expect(result.success).toBe(true);
    expect(result.data?.details).toEqual({});
  });

  it('trims surrounding whitespace from the body', () => {
    const result = reviewSubmissionSchema.safeParse(submission({ body: `  ${VALID_BODY}\n\n` }));

    expect(result.data?.body).toBe(VALID_BODY);
  });

  it('rejects a body shorter than the minimum once trimmed', () => {
    const padded = `${'a'.repeat(MIN_REVIEW_BODY_LENGTH - 1)}${' '.repeat(20)}`;

    expect(reviewSubmissionSchema.safeParse(submission({ body: padded })).success).toBe(false);
  });

  it('rejects a body longer than the maximum', () => {
    const tooLong = 'a'.repeat(MAX_REVIEW_BODY_LENGTH + 1);

    expect(reviewSubmissionSchema.safeParse(submission({ body: tooLong })).success).toBe(false);
  });

  it('rejects an unsupported locale', () => {
    expect(reviewSubmissionSchema.safeParse(submission({ locale: 'fr' })).success).toBe(false);
  });

  it('accepts Amharic', () => {
    const result = reviewSubmissionSchema.safeParse(
      submission({
        locale: 'am',
        body: 'ቢሮው አላውቀው የነበረ ተጨማሪ ቅጂ ጠየቀኝ፤ በዚህም በሚቀጥለው ቀን መመለስ ነበረብኝ።',
      }),
    );

    expect(result.success).toBe(true);
  });
});

describe('review anti-advertising rules', () => {
  /**
   * A free-text box on a government service page attracts fixers. These are the
   * shapes that matter: a link to reach them, or a number to call.
   */
  it.each([
    'Call the broker on https://example.com to skip the queue for this service.',
    'Message www.example.com and they will handle the whole registration for you.',
    'Join our channel t.me/somebroker for help with this service application.',
    'Contact this agent at agentservices.et for a much faster appointment date.',
  ])('rejects a body containing a link: %s', (body) => {
    expect(reviewSubmissionSchema.safeParse(submission({ body })).success).toBe(false);
  });

  it('rejects a body containing a phone number', () => {
    const body = 'A helpful agent outside the gate gave me his number, 0911234567, for next time.';

    expect(reviewSubmissionSchema.safeParse(submission({ body })).success).toBe(false);
  });

  it('still accepts the fees and dates a real account needs', () => {
    // The whole point of the feature is reports like this one, so the digit rule
    // must not be so eager that it eats them.
    const body = 'I paid 350 ETB in total and the receipt was dated 12-03-2026 when I collected.';

    expect(reviewSubmissionSchema.safeParse(submission({ body })).success).toBe(true);
  });

  it('applies the same rules to the office name', () => {
    const result = reviewSubmissionSchema.safeParse(
      submission({ details: { officeVisited: 'see queuehelper.com' } }),
    );

    expect(result.success).toBe(false);
  });
});

describe('review details validation', () => {
  it('drops fields an author left blank', () => {
    const result = reviewDetailsSchema.safeParse({
      officeVisited: '',
      waitTime: '',
      outcome: 'completed',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ outcome: 'completed' });
  });

  it('keeps the structured answers it recognises', () => {
    const result = reviewDetailsSchema.safeParse({
      officeVisited: 'Bole sub-city branch',
      waitTime: 'half-day',
      outcome: 'still-trying',
    });

    expect(result.data).toEqual({
      officeVisited: 'Bole sub-city branch',
      waitTime: 'half-day',
      outcome: 'still-trying',
    });
  });

  it('rejects a value outside the enumerated set', () => {
    expect(reviewDetailsSchema.safeParse({ waitTime: 'a couple of weeks' }).success).toBe(false);
    expect(reviewDetailsSchema.safeParse({ outcome: 'maybe' }).success).toBe(false);
  });
});
