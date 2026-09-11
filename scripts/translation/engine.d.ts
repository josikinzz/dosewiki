import type { TranslationLocale } from "./locales";

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
  model: string;
  apiKey: string;
  onUsage?: (usage: BatchUsage, attempt: number) => void;
}): Promise<SegmentVerdict[]>;

export function retryNoteFor(defects: readonly string[]): string;
