import type { ReviewQueueOrder } from "./reviewQueue";
import type { ReviewFlagSeverity } from "@/schema/substance/editorial";

/** Milestone counts worth a moment of celebration during the 274-article pass. */
const REVIEW_MILESTONES = [50, 100, 150, 200, 250] as const

/** The milestone crossed by moving from `previous` to `next` reviewed, if any. */
export function crossedMilestone(previous: number, next: number): number | null {
  return REVIEW_MILESTONES.find((mark) => previous < mark && next >= mark) ?? null;
}

export type ReviewViewMode = "webpage" | "editor";

export interface ReviewSettings {
  order: ReviewQueueOrder;
  /**
   * Restrict ←/→ flipping to still-unreviewed articles. Off by default since
   * v3: the skip read as the arrows "not working" — flipping toward an article
   * visible in the picker and landing somewhere else — so traversing
   * everything is the behaviour, and the skip is the opt-in.
   */
  unreviewedOnly: boolean;
  viewMode: ReviewViewMode;
  /**
   * Click-to-edit on the rendered article. Off until asked for: reading is the
   * common case, and a page whose text turns into inputs under the cursor is a
   * hazard for a reviewer who only meant to scroll.
   */
  inlineEdit: boolean;
  /**
   * Present the jump-to picker as the home page's category tree — psychoactive
   * classes holding their chemical-class subsections — rather than one flat
   * list. On by default: 274 articles in a single scroll is a haystack.
   */
  groupByCategory: boolean;
  /**
   * Let links inside the rendered article navigate. Off by default: articles
   * are dense with cross-links, and a stray tap mid-review yanks the reviewer
   * to another page. Same-page TOC anchors always work regardless.
   */
  articleLinks: boolean;
  flagLabels: string[];
  flagSeverity: ReviewFlagSeverity | null;
  flagGroupBy: "none" | "severity" | "label";
}

export const REVIEW_SETTINGS_DEFAULTS: ReviewSettings = {
  order: "home",
  unreviewedOnly: false,
  viewMode: "webpage",
  inlineEdit: false,
  groupByCategory: true,
  articleLinks: false,
  flagLabels: [],
  flagSeverity: null,
  flagGroupBy: "none",
};

const STORAGE_KEY = "dosewiki:review-workbench:v3";

/**
 * Older payloads still load, minus the preference each bump exists to reset.
 * Honouring the stored value would pin every reviewer who ever opened the old
 * workbench to the old default — the one case where silently resetting a
 * preference is the point rather than a bug. Everything else carries over.
 *
 * v2 moved the default order from "most source material" to home-page order,
 * so a v1 `order` is dropped. v3 turned off `unreviewedOnly` — the skip made
 * ←/→ appear broken, and nearly every stored `true` was the old default
 * persisted incidentally, not a choice — so v1/v2 `unreviewedOnly` is dropped.
 */
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

/**
 * Restore the reviewer's session preferences. A refresh mid-project must not
 * silently reset her chosen ordering or filter.
 */
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
    // Private-mode storage failures just lose persistence, never the session.
  }
}
