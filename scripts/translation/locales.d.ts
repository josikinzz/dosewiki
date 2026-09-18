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

/** The surface a work unit's text comes from; "any" (the default) disables kind scoping for its batch. */
export type PromptContextKind = "article" | "effect" | "report" | "library" | "replication" | "any";

/** Glosses printed per batch at most; past the cap a line prints the rendering only. */
export const GLOSS_CAP: number;

/** Whether a glossary term of `kind` belongs in a batch whose units carry `contexts`; see locales.mjs. */
export function kindInContext(kind: string, contexts: ReadonlySet<string>): boolean;

export function buildBatchPrompt(
  locale: TranslationLocale,
  units: readonly { id: string; source: string; contextClass: string; markup?: boolean; contextKind?: PromptContextKind }[],
  options?: {
    retryNote?: string;
    glossary?: Readonly<Record<string, string>>;
    glosses?: Readonly<Record<string, string>>;
    kinds?: Readonly<Record<string, string>>;
  },
): string;
