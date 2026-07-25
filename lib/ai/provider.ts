import 'server-only';
import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import { getEnv } from '@/lib/env';

let provider: OpenRouterProvider | null = null;

function getProvider(): OpenRouterProvider {
  if (provider) return provider;

  const env = getEnv();
  provider = createOpenRouter({
    apiKey: env.OPENROUTER_API_KEY,
    compatibility: 'strict',
    appName: 'GovGuide-AI',
    ...(env.APP_URL ? { appUrl: env.APP_URL } : {}),
  });

  return provider;
}

/**
 * Model roles are read from the environment on every call rather than captured
 * at import time, so swapping a model is a restart, not a redeploy — and no
 * model ID is ever written into the source.
 */
export function getRouterModel(): LanguageModel {
  return getProvider().chat(getEnv().OPENROUTER_ROUTER_MODEL);
}

export function getAnswerModel(): LanguageModel {
  return getProvider().chat(getEnv().OPENROUTER_ANSWER_MODEL);
}

export function getSummaryModel(): LanguageModel {
  const env = getEnv();
  return getProvider().chat(env.OPENROUTER_SUMMARY_MODEL ?? env.OPENROUTER_ANSWER_MODEL);
}

/**
 * Shared decoding settings for every call.
 *
 * Near-zero temperature with a fixed seed keeps answers reproducible: the same
 * question about the same record should not produce different guidance on
 * Tuesday than it did on Monday.
 */
export const DETERMINISTIC_DECODING = {
  temperature: 0,
  seed: 7,
} as const;
