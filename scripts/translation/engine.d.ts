import type { PromptContextKind, TranslationLocale } from "./locales";
import type { OpenRouterChatResult } from "../lib/openrouter-sdk.mjs";
import type { PromptStyleGuide } from "./style-guide.mjs";

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
  contextKind?: PromptContextKind;
  context?: string;
};

export class TranslationTransportError extends Error {
  constructor(cause: unknown);
  readonly code: "TRANSPORT_FAILURE";
  readonly status: number | null;
  readonly retryable: boolean;
}

export type BatchUsage = { prompt: number; completion: number };

export type SegmentVerdict = {
  unit: WorkUnit & { id?: string };
  target: string;
  defects: string[];
  details: Record<string, unknown>;
  attempts: number;
};

export function planBatches(units: readonly WorkUnit[], batchChars?: number): WorkUnit[][];

export function sendBatch(input: {
  locale: TranslationLocale;
  model: string;
  apiKey: string;
  userMessage: string;
  temperature?: number;
  signal?: AbortSignal;
  systemPrompt?: string;
  appTitle?: string;
}): Promise<OpenRouterChatResult>;

export function translateBatchWithRetries(input: {
  units: readonly WorkUnit[];
  locale: TranslationLocale;
  glossary: Readonly<Record<string, string>>;
  glosses: Readonly<Record<string, string>>;
  kinds: Readonly<Record<string, string>>;
  styleGuide?: PromptStyleGuide | null;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
  onUsage?: (usage: BatchUsage, attempt: number) => void;
}): Promise<SegmentVerdict[]>;

export function retryNoteFor(defects: readonly string[]): string;


export function protectModelTokens(source: string): { source: string; restore(target: string): string };
export function translateBatch(input: {
  units: readonly WorkUnit[];
  locale: TranslationLocale;
  glossary: Readonly<Record<string, string>>;
  glosses: Readonly<Record<string, string>>;
  kinds: Readonly<Record<string, string>>;
  styleGuide?: PromptStyleGuide | null;
  model: string;
  apiKey: string;
  retryNote?: string;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<{ usage: BatchUsage; results: Array<{ unit: WorkUnit; target: string | null; parseCode: string | null }> }>;
