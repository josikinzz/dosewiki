export type TranslationLocale = {
  code: string;
  label: string;
  scriptGate: "simplified" | "none";
  lengthBand: [number, number];
  systemPrompt: string;
};

export const LOCALES: Readonly<Record<string, TranslationLocale>>;

/** The locale configuration. Throws on an unknown code. */
export function resolveLocale(code: string): TranslationLocale;

/** Where `build-glossary.mjs --export` writes a locale's snapshot. */
export function glossaryPath(code: string): string;

/** Whole-word, case-insensitive matcher for one glossary term; shared by the prompt, the validator, and the scoped stale replay. */
export function glossaryTermPattern(term: string): RegExp;

export function buildBatchPrompt(
  locale: TranslationLocale,
  units: readonly { id: string; source: string; contextClass: string; markup?: boolean }[],
  options?: { retryNote?: string; glossary?: Readonly<Record<string, string>> },
): string;
