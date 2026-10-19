import type { TranslationLocale } from "./locales.mjs";

export const DEFECT_CODES: Readonly<Record<string, string>>;
export const BLOCKING_DEFECTS: readonly string[];
export function isBlocking(defects: readonly string[]): boolean;
export function hasChinese(text: string): boolean;
export function validateSegment(input: {
  source: string;
  target: unknown;
  locale: TranslationLocale;
  glossary?: Readonly<Record<string, string>>;
  markup?: boolean;
  exactTarget?: string;
  latinNames?: Iterable<string>;
}): { defects: string[]; details: Record<string, unknown> };
export function findRepeatedPunctuation(source: string, target: string): string[];
export function findLeftoverLatin(input: {
  source: string;
  target: string;
  glossary?: Readonly<Record<string, string>>;
  latinNames?: Iterable<string>;
  markup?: boolean;
}): string[];
export function parseModelJson(raw: unknown): { ok: boolean; code: string | null; value: Record<string, unknown> | null };
