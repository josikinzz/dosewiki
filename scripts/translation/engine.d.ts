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
  /** The surface the text comes from, so the prompt can scope glossary kinds; absent means "any". */
  contextKind?: PromptContextKind;
  /** Meaning of a contextual UI label, kept separate from translatable text. */
  context?: string;
};

/** A provider request that failed for transport or authorization reasons; never a content defect. */
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
  /** Defaults to the locale's translation prompt. */
  systemPrompt?: string;
  /** Defaults to APP_TITLE. */
  appTitle?: string;
}): Promise<OpenRouterChatResult>;

export function translateBatchWithRetries(input: {
  units: readonly WorkUnit[];
  locale: TranslationLocale;
  /** The approved `term -> target` map, loaded by the caller from Postgres. */
  glossary: Readonly<Record<string, string>>;
  /** The locale-independent `term -> gloss` map, loaded by the caller from Postgres; printed beside each injected term. */
  glosses: Readonly<Record<string, string>>;
  /** `term -> kind` for the approved rows, so the prompt can confine surface-specific kinds to their surface. */
  kinds: Readonly<Record<string, string>>;
  /** The locale's approved style guide, loaded by the caller; null or absent prints no style block. */
  styleGuide?: PromptStyleGuide | null;
  model: string;
  apiKey: string;
  /** Cancels in-flight requests and stops transport and validation retries. */
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
