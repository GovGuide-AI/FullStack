import type { Citation } from '@/lib/knowledge/citations';
import type { Locale } from '@/lib/locales';
import { MAX_CANDIDATES, NEEDS_CLARIFICATION, NO_MATCH } from './schemas';

const LANGUAGE_NAME: Record<Locale, string> = {
  en: 'English',
  am: 'Amharic',
};

export function buildRouterPrompt(input: {
  question: string;
  locale: Locale;
  catalog: string;
  clarification?: { question: string; answer: string } | null;
}): { system: string; prompt: string } {
  const answered = Boolean(input.clarification);

  const system = [
    'You match a question about Ethiopian government services to entries in a fixed catalog.',
    '',
    '`serviceSlug` is exactly one of: a catalog slug, ' +
      `"${NEEDS_CLARIFICATION}", or "${NO_MATCH}".`,
    `- A slug, only when one entry plainly covers the question. Do not stretch a loose match; a wrong match is worse than admitting the service is missing.`,
    answered
      ? // Asking twice would trap someone in a loop they cannot escape, so the
        // second pass has to commit one way or the other.
        `- "${NEEDS_CLARIFICATION}" is not available: the user has already answered one clarifying question. Decide from their answer, or answer "${NO_MATCH}".`
      : `- "${NEEDS_CLARIFICATION}", when the question is near one or more entries but you cannot yet pick one, and one short question would settle it. Put that question in \`clarifyingQuestion\`.`,
    `- "${NO_MATCH}" for anything else, including a question that is merely near an entry. Name near entries in \`candidates\` instead of choosing one of them.`,
    `- Leave \`clarifyingQuestion\` empty unless you answered "${NEEDS_CLARIFICATION}".`,
    '',
    `\`candidates\` is up to ${MAX_CANDIDATES} slugs, nearest first, and is filled in whichever \`serviceSlug\` you gave.`,
    '- Near means the same document, office, or task as the question, even when no entry covers exactly what was asked. A shared category alone is not near.',
    '- Empty when nothing in the catalog is near. Naming a candidate is not matching it — the user picks from these themselves.',
    '',
    'The user may write in English or Amharic, and may use a service name from either language. Match on meaning.',
    'You are only routing. Do not answer the question, and do not describe any procedure, fee, or document.',
  ].join('\n');

  const language = LANGUAGE_NAME[input.locale];

  const prompt = [
    'Catalog:',
    input.catalog,
    '',
    `User question (written in ${language}):`,
    input.question,
    ...(input.clarification
      ? [
          '',
          'You then asked:',
          input.clarification.question,
          '',
          'The user answered:',
          input.clarification.answer,
        ]
      : []),
  ].join('\n');

  return { system, prompt };
}

export function buildExplanationPrompt(input: {
  question: string;
  locale: Locale;
  serviceTitle: string;
  citations: readonly Citation[];
}): { system: string; prompt: string } {
  const language = LANGUAGE_NAME[input.locale];

  const system = [
    `You write a short orientation for someone about to use an Ethiopian government service. Write in ${language}.`,
    '',
    'Rules:',
    '- Use ONLY the numbered facts supplied below. They are the complete set of information you have.',
    '- Never state a fee, office, document, deadline, or processing time that is not among those facts.',
    '- If the facts do not answer part of the question, say that this detail is not recorded. Do not fill the gap.',
    '- List the id of every fact you used in `citations`. Only ids from the list are valid.',
    '- Do not repeat the full checklist; it is displayed separately. Orient the reader in two to four sentences.',
    '- Plain, direct language. No greetings, no filler, no offers to help further.',
  ].join('\n');

  const facts = input.citations
    .map((citation) => `${citation.id}: ${citation.label}`)
    .join('\n');

  const prompt = [
    `Service: ${input.serviceTitle}`,
    '',
    'Facts available (id: content):',
    facts,
    '',
    `The user asked (in ${language}):`,
    input.question,
  ].join('\n');

  return { system, prompt };
}
