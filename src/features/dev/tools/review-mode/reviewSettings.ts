import type { ReviewQueueOrder } from "./reviewQueue";
import type { ReviewFlagSeverity } from "@/schema/substance/editorial";

const REVIEW_MILESTONES = [50, 100, 150, 200, 250] as const

export function crossedMilestone(previous: number, next: number): number | null {
  return REVIEW_MILESTONES.find((mark) => previous < mark && next >= mark) ?? null;
}

export type ReviewViewMode = "webpage" | "editor";

export interface ReviewSettings {
  order: ReviewQueueOrder;
  unreviewedOnly: boolean;
  changedSinceReview: boolean;
  viewMode: ReviewViewMode;
  inlineEdit: boolean;
  groupByCategory: boolean;
  articleLinks: boolean;
  flagLabels: string[];
  flagSeverity: ReviewFlagSeverity | null;
  flagGroupBy: "none" | "severity" | "label";
}

export const REVIEW_SETTINGS_DEFAULTS: ReviewSettings = {
  order: "home",
  unreviewedOnly: false,
  changedSinceReview: false,
  viewMode: "webpage",
  inlineEdit: false,
  groupByCategory: true,
  articleLinks: false,
  flagLabels: [],
  flagSeverity: null,
  flagGroupBy: "none",
};

const STORAGE_KEY = "dosewiki:review-workbench:v3";

const LEGACY_KEYS: Array<{ key: string; keepOrder: boolean }> = [
  { key: "dosewiki:review-workbench:v2", keepOrder: true },
  { key: "dosewiki:review-workbench:v1", keepOrder: false },
];

const ORDERS = new Set(["sources", "home", "alpha", "alpha-desc"]);

function parseSettings(
  raw: string,
  options: { keepOrder: boolean; keepUnreviewedOnly: boolean },
): ReviewSettings {
  const parsed = JSON.parse(raw) as Partial<ReviewSettings>;
  return {
    order:
      options.keepOrder && ORDERS.has(parsed.order as string)
        ? (parsed.order as ReviewQueueOrder)
        : REVIEW_SETTINGS_DEFAULTS.order,
    unreviewedOnly:
      options.keepUnreviewedOnly && typeof parsed.unreviewedOnly === "boolean"
        ? parsed.unreviewedOnly
        : REVIEW_SETTINGS_DEFAULTS.unreviewedOnly,
    changedSinceReview:
      typeof parsed.changedSinceReview === "boolean"
        ? parsed.changedSinceReview
        : REVIEW_SETTINGS_DEFAULTS.changedSinceReview,
    viewMode:
      parsed.viewMode === "editor" || parsed.viewMode === "webpage"
        ? parsed.viewMode
        : REVIEW_SETTINGS_DEFAULTS.viewMode,
    inlineEdit:
      typeof parsed.inlineEdit === "boolean"
        ? parsed.inlineEdit
        : REVIEW_SETTINGS_DEFAULTS.inlineEdit,
    groupByCategory:
      typeof parsed.groupByCategory === "boolean"
        ? parsed.groupByCategory
        : REVIEW_SETTINGS_DEFAULTS.groupByCategory,
    articleLinks:
      typeof parsed.articleLinks === "boolean"
        ? parsed.articleLinks
        : REVIEW_SETTINGS_DEFAULTS.articleLinks,
    flagLabels: Array.isArray(parsed.flagLabels) ? parsed.flagLabels.filter((value): value is string => typeof value === "string") : [],
    flagSeverity: parsed.flagSeverity === "major" || parsed.flagSeverity === "minor" || parsed.flagSeverity === "note" ? parsed.flagSeverity : null,
    flagGroupBy: parsed.flagGroupBy === "severity" || parsed.flagGroupBy === "label" ? parsed.flagGroupBy : "none",
  };
}

export function loadReviewSettings(): ReviewSettings {
  if (typeof window === "undefined") {
    return REVIEW_SETTINGS_DEFAULTS;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return parseSettings(raw, { keepOrder: true, keepUnreviewedOnly: true });
    for (const legacy of LEGACY_KEYS) {
      const stored = window.localStorage.getItem(legacy.key);
      if (stored) {
        return parseSettings(stored, {
          keepOrder: legacy.keepOrder,
          keepUnreviewedOnly: false,
        });
      }
    }
    return REVIEW_SETTINGS_DEFAULTS;
  } catch {
    return REVIEW_SETTINGS_DEFAULTS;
  }
}

export function saveReviewSettings(settings: ReviewSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
  }
}
