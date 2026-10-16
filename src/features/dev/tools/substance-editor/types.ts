import type { EditorStatusPillTone } from "@/features/dev/components";
import { REVIEW_STATUS_NAMES } from "@/features/dev/tools/review-mode/reviewStatusNames";





export interface SubstanceEditorTabProps {
  initialSlug?: string;
}











export type SortOrder = "alpha-asc" | "alpha-desc";
export type ReviewStatus = "needed" | "in_progress" | "completed";

export const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; tone: EditorStatusPillTone }> = {
  needed: { label: REVIEW_STATUS_NAMES.needed, tone: "danger" },
  in_progress: { label: REVIEW_STATUS_NAMES.in_progress, tone: "warning" },
  completed: { label: REVIEW_STATUS_NAMES.completed, tone: "success" },
};

export interface SubstanceInfo {
  slug: string;
  name: string;
  reviewStatus: ReviewStatus;
}




