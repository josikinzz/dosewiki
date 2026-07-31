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
}

export const REVIEW_SETTINGS_DEFAULTS: ReviewSettings = {
  order: "sources",
  unreviewedOnly: true,
  viewMode: "webpage",
  inlineEdit: false,
};

const STORAGE_KEY = "dosewiki:review-workbench:v1";

const ORDERS = new Set(["sources", "home", "alpha", "alpha-desc"]);

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
    if (!raw) return REVIEW_SETTINGS_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ReviewSettings>;
    return {
      order: ORDERS.has(parsed.order as string)
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
    };
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
