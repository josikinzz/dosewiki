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
};
export type UiTranslationListResponse = { ok: true; locale: string; locales: string[]; rows: UiTranslationRow[] };
export type UiTranslationHistoryResponse = { ok: true; history: ReviewHistoryEntry[] };
export type UiTranslationWriteResponse = { ok: true; row: UiTranslationRow };
