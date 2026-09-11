export type TranslationLocale = {
  code: string;
  label: string;
  scriptGate: "simplified" | "none";
  lengthBand: [number, number];
  glossary: Readonly<Record<string, string>>;
  systemPrompt: string;
};

export const LOCALES: Readonly<Record<string, TranslationLocale>>;

/** The locale with its frozen glossary file merged in. Throws on an unknown code. */
export function resolveLocale(code: string): TranslationLocale;

export function buildBatchPrompt(
  locale: TranslationLocale,
  units: readonly { id: string; source: string; contextClass: string; markup?: boolean }[],
  options?: { retryNote?: string },
): string;
