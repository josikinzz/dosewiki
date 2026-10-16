import type { ReviewState } from "@/schema/substance/editorial";

export const REVIEW_STATUS_NAMES: Record<ReviewState, string> = {
  needed: "Not reviewed",
  in_progress: "On hold",
  completed: "Reviewed",
  stale: "Changed since review",
};
