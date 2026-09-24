import type { TranslationLocale } from "./locales";

export const DEFECT_CODES: Readonly<Record<string, string>>;
export const BLOCKING_DEFECTS: readonly string[];
export function isBlocking(defects: readonly string[]): boolean;
export function validateSegment(input: {
  source: string;
  target: unknown;
  locale: TranslationLocale;
  glossary?: Readonly<Record<string, string>>;
  markup?: boolean;
  /** Approved rendering for this contextual label; prose leaves this unset. */
  exactTarget?: string;
  /** Names known to stay in Latin script (substance slugs) for the leftover-Latin finding. */
  latinNames?: Iterable<string>;
}): { defects: string[]; details: Record<string, unknown> };
/** Runs of adjacent full-width marks ("，，") the source does not repeat, each once. */
export function findRepeatedPunctuation(source: string, target: string): string[];
/** English words of four or more letters left in Chinese output that no glossary rendering, locale name rule, or `latinNames` entry keeps in Latin. */
export function findLeftoverLatin(input: {
  source: string;
  target: string;
  glossary?: Readonly<Record<string, string>>;
  latinNames?: Iterable<string>;
  markup?: boolean;
}): string[];
export function parseModelJson(raw: unknown): { ok: boolean; code: string | null; value: Record<string, unknown> | null };
