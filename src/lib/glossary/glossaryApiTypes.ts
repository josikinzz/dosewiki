import type { GlossaryLocaleSummary } from "@server/translation/glossary";
import type { GlossaryReviewRow } from "@server/translation/glossaryReview";
import type { TranslationRecordKind } from "@server/translation/liveTranslation";
import type { TranslationJobCounts } from "@server/translation/segmentStore";
import type { GlossaryUsageMap } from "@/lib/glossary/glossaryUsage";

export type GlossaryLocaleOption = GlossaryLocaleSummary & { live: boolean };

export type GlossaryListResponse = {
  ok: true;
  generatedAt: number;
  locale: string;
  promptVersion: string;
  segments: { total: number; current: number };
  jobs: TranslationJobCounts;
  locales: GlossaryLocaleOption[];
  rows: GlossaryReviewRow[];
  usages?: GlossaryUsageMap;
  pending: string[];
  glosses: Record<string, string>;
};

export type GlossaryProgressResponse = Pick<GlossaryListResponse, "ok" | "generatedAt" | "locale" | "promptVersion" | "segments" | "jobs">;

export type GlossaryRowPatch = Pick<GlossaryListResponse, "rows" | "pending">;

export type RetranslateResponse = {
  ok: true;
  status: "queued";
  requestedAt: number;
  locale: string;
  terms: string[];
  promptVersion: string;
  segments: number;
  restamped: number;
  runId: string;
  jobs: Partial<Record<TranslationRecordKind, number>>;
};
