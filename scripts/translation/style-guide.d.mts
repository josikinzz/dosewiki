import type { TranslationLocale } from "./locales.mjs";

export type PromptStyleExample = {
  id: string;
  source?: string;
  before: string;
  after: string;
  why: string;
  addedAt?: number;
};

export type PromptStyleGuide = {
  rules: readonly string[];
  examples: readonly PromptStyleExample[];
  revision: string;
};

export const STYLE_EXAMPLE_LIMIT: number;
export const STYLE_EXAMPLE_CHAR_CAP: number;

export function styleExampleTerms(english: string | undefined): string[];
export function styleExampleOverlap(example: PromptStyleExample, text: string): number;
export function selectStyleExamples<T extends PromptStyleExample>(examples: readonly T[], text: string, options?: { limit?: number; charCap?: number }): T[];
export function styleGuidePromptLines(locale: TranslationLocale, styleGuide: PromptStyleGuide | null | undefined, text: string): string[];
