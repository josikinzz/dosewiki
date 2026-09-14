import type { PromptContextKind, TranslationLocale } from "./locales";

export const DEFAULT_MODEL: string;
export const APP_TITLE: string;
export const DEFAULT_BATCH_CHARS: number;
export const MAX_ATTEMPTS: number;

export type WorkUnit = {
  hash: string;
  source: string;
  contextClass: "safety" | "prose";
  group: string;
  markup: boolean;
  words: number;
  occurrences: number;
  /** The surface the text comes from, so the prompt can scope glossary kinds; absent means "any". */
  contextKind?: PromptContextKind;
};

export type BatchUsage = { prompt: number; completion: number };

export type SegmentVerdict = {
  unit: WorkUnit & { id?: string };
  target: string;
  defects: string[];
  details: Record<string, unknown>;
  attempts: number;
};

export function planBatches(units: readonly WorkUnit[], batchChars?: number): WorkUnit[][];

export function translateBatchWithRetries(input: {
  units: readonly WorkUnit[];
  locale: TranslationLocale;
  /** The approved `term -> target` map, loaded by the caller from Postgres. */
  glossary: Readonly<Record<string, string>>;
  /** The locale-independent `term -> gloss` map, loaded by the caller from Postgres; printed beside each injected term. */
  glosses: Readonly<Record<string, string>>;
  /** `term -> kind` for the approved rows, so the prompt can confine surface-specific kinds to their surface. */
  kinds: Readonly<Record<string, string>>;
  model: string;
  apiKey: string;
  onUsage?: (usage: BatchUsage, attempt: number) => void;
}): Promise<SegmentVerdict[]>;

export function retryNoteFor(defects: readonly string[]): string;
