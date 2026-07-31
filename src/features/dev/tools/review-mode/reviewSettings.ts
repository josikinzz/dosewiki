import type { ReviewQueueOrder } from "./reviewQueue";

/** Milestone counts worth a moment of celebration during the 274-article pass. */
export const REVIEW_MILESTONES = [50, 100, 150, 200, 250] as const;

/** The milestone crossed by moving from `previous` to `next` reviewed, if any. */
export function crossedMilestone(previous: number, next: number): number | null {
  return REVIEW_MILESTONES.find((mark) => previous < mark && next >= mark) ?? null;
}

export type ReviewViewMode = "webpage" | "editor";

export interface ReviewSettings {
  order: ReviewQueueOrder;
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
}

export const REVIEW_SETTINGS_DEFAULTS: ReviewSettings = {
  order: "home",
  unreviewedOnly: true,
  viewMode: "webpage",
  inlineEdit: false,
  groupByCategory: true,
  articleLinks: false,
};

const STORAGE_KEY = "dosewiki:review-workbench:v2";

/**
 * The v1 payload still loads, minus its `order`.
 *
 * v2 moved the default order from "most source material" to home-page order.
 * Honouring a stored v1 `order` would pin every reviewer who ever opened the
 * old workbench to the old default — the one case where silently resetting a
 * preference is the point rather than a bug. Everything else carries over.
 */
const LEGACY_STORAGE_KEY = "dosewiki:review-workbench:v1";

const ORDERS = new Set(["sources", "home", "alpha", "alpha-desc"]);

function parseSettings(raw: string, keepOrder: boolean): ReviewSettings {
  const parsed = JSON.parse(raw) as Partial<ReviewSettings>;
  return {
    order:
      keepOrder && ORDERS.has(parsed.order as string)
        ? (parsed.order as ReviewQueueOrder)
        : REVIEW_SETTINGS_DEFAULTS.order,
    unreviewedOnly:
      typeof parsed.unreviewedOnly === "boolean"
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
    if (raw) return parseSettings(raw, true);
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return parseSettings(legacy, false);
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
