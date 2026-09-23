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
}): { defects: string[]; details: Record<string, unknown> };
export function parseModelJson(raw: unknown): { ok: boolean; code: string | null; value: Record<string, unknown> | null };
