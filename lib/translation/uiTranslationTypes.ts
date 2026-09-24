import type { ReviewEntry, ReviewHistoryEntry } from "./reviewTypes";
export type UiTranslationRow = Pick<ReviewEntry, "revision" | "draft" | "approved"> & {
  id: string;
  source: string;
  context: string;
  locations: readonly string[];
  glossaryTerms: readonly string[];
  updatedAt: number | null;
  /** Checked-in catalog wording, not evidence of deployed or human-reviewed state. */
  compiledTarget: string | null;
  status: "missing" | "unreviewed" | "draft" | "approved" | "stale";
  /** The compiled wording disagrees with an approved glossary term and waits for
   * the next online catalog build. `term` is null on records compiled before the
   * term was recorded. Absent or null when nothing waits, and for approved rows. */
  pendingRefresh?: { term: string | null; expectedTarget: string | null } | null;
};
export type UiTranslationListResponse = {
  ok: true; locale: string; locales: string[]; rows: UiTranslationRow[];
  /** False when the compile that produced the waiting list could not refresh it (an offline compile). */
  catalogRefreshed?: boolean;
};
export type UiTranslationHistoryResponse = { ok: true; history: ReviewHistoryEntry[] };
export type UiTranslationWriteResponse = { ok: true; row: UiTranslationRow };

/** Batch review covers labels of this many words or fewer; longer strings keep the one-at-a-time card. */
export const SHORT_LABEL_MAX_WORDS = 3;
/** Requests carry at most this many labels; larger selections are sent in chunks. */
export const UI_BATCH_MAX_ITEMS = 200;
export const UI_BATCH_APPROVAL_REASON = "Batch reviewed in context";
export function isShortUiLabel(source: string): boolean {
  const text = source.trim();
  return Boolean(text) && !text.includes("\n") && text.split(/\s+/).length <= SHORT_LABEL_MAX_WORDS;
}
/** The wording the reviewer saw on screen: the revision they loaded and the target they checked. */
export type UiBatchApprovalItem = { id: string; expectedRevision: number; target: string };
export type UiBatchApprovalResult = { id: string; ok: true; row: UiTranslationRow } | { id: string; ok: false; code: string; error: string };
export type UiBatchApprovalResponse = { ok: true; results: UiBatchApprovalResult[] };
