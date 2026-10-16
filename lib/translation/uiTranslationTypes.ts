import type { ReviewEntry, ReviewHistoryEntry } from "./reviewTypes";
import type { GlossaryMention } from "./glossaryConflicts";
export type UiTranslationRow = Pick<ReviewEntry, "revision" | "draft" | "approved"> & {
  id: string;
  source: string;
  context: string;
  locations: readonly string[];
  glossaryTerms: readonly string[];
  updatedAt: number | null;
  compiledTarget: string | null;
  status: "missing" | "unreviewed" | "draft" | "approved" | "stale";
  pendingRefresh?: { term: string | null; expectedTarget: string | null } | null;
  glossary?: GlossaryMention[];
};
export type UiTranslationListResponse = {
  ok: true; locale: string; locales: string[]; rows: UiTranslationRow[];
  catalogRefreshed?: boolean;
};
export type UiTranslationHistoryResponse = { ok: true; history: ReviewHistoryEntry[] };
export type UiTranslationWriteResponse = { ok: true; row: UiTranslationRow };

export const SHORT_LABEL_MAX_WORDS = 3;
export const UI_BATCH_MAX_ITEMS = 200;
export const UI_BATCH_APPROVAL_REASON = "Batch reviewed in context";
export function isShortUiLabel(source: string): boolean {
  const text = source.trim();
  return Boolean(text) && !text.includes("\n") && text.split(/\s+/).length <= SHORT_LABEL_MAX_WORDS;
}
export type UiBatchApprovalItem = { id: string; expectedRevision: number; target: string };
export type UiBatchApprovalResult = { id: string; ok: true; row: UiTranslationRow } | { id: string; ok: false; code: string; error: string };
export type UiBatchApprovalResponse = { ok: true; results: UiBatchApprovalResult[] };
