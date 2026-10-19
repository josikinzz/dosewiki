import type { PromptStyleGuide } from "./style-guide.mjs";

export type TranslationLocale = {
  code: string;
  label: string;
  scriptGate: "simplified" | "none";
  lengthBand: [number, number];
  systemPrompt: string;
};

export const LOCALES: Readonly<Record<string, TranslationLocale>>;

export function resolveLocale(code: string): TranslationLocale;

export function isLatinName(word: string, source: string): boolean;

export function glossaryPath(code: string): string;

export function glossaryTermPattern(term: string): RegExp;

export type PromptContextKind = "article" | "effect" | "report" | "library" | "replication" | "profile" | "any";

export const GLOSS_CAP: number;

export function kindInContext(kind: string, contexts: ReadonlySet<string>): boolean;

export function buildBatchPrompt(
  locale: TranslationLocale,
  units: readonly { id: string; source: string; contextClass: string; markup?: boolean; contextKind?: PromptContextKind; context?: string }[],
  options?: {
    retryNote?: string;
    glossary?: Readonly<Record<string, string>>;
    glosses?: Readonly<Record<string, string>>;
    kinds?: Readonly<Record<string, string>>;
    styleGuide?: PromptStyleGuide | null;
  },
): string;
