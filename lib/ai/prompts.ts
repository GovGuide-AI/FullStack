import type { Citation } from '@/lib/knowledge/citations';
import type { Locale } from '@/lib/locales';
import { NEEDS_CLARIFICATION, NO_MATCH } from './schemas';

const LANGUAGE_NAME: Record<Locale, string> = {
  en: 'English',
  am: 'Amharic',
};

export function buildRouterPrompt(input: {
  question: string;
  locale: Locale;
  catalog: string;
}): { system: string; prompt: string } {
  const system = [
    'You match a question about Ethiopian government services to one entry in a fixed catalog.',
    '',
    'Rules:',
    `- Choose exactly one slug from the catalog, or "${NO_MATCH}", or "${NEEDS_CLARIFICATION}".`,
    `- If no catalog entry plainly covers the question, answer "${NO_MATCH}". Do not stretch a loose match; a wrong match is worse than admitting the service is missing.`,
    `- If the question could reasonably mean two or more catalog entries, answer "${NEEDS_CLARIFICATION}" and write one short question that would separate them.`,
    '- The user may write in English or Amharic, and may use a service name from either language. Match on meaning.',
    '- You are only routing. Do not answer the question, and do not describe any procedure, fee, or document.',
  ].join('\n');

  const prompt = [
    'Catalog:',
    input.catalog,
    '',
    `User question (written in ${LANGUAGE_NAME[input.locale]}):`,
    input.question,
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
