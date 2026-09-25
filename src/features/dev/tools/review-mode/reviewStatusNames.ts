import type { ReviewState } from "@/schema/substance/editorial";

/**
 * The one set of review status names every editor surface shows: the
 * Substances list, the /review picker and command bar, and their toasts.
 * The glossary's Article Review Language records the same words; the public
 * article only ever says whether an article is reviewed.
 */
export const REVIEW_STATUS_NAMES: Record<ReviewState, string> = {
  needed: "Not reviewed",
  in_progress: "On hold",
  completed: "Reviewed",
  stale: "Changed since review",
};
