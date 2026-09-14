import type { ReactNode } from "react";
import type { EditorStatusPillTone } from "@/features/dev/components";





export interface SubstanceEditorTabProps {
  /** Render function for commit panel - receives optional action slot for buttons and tab-specific description copy */
  renderCommitPanel?: (actionSlot?: ReactNode, description?: ReactNode) => ReactNode;
  /** The `/dev/articles/<slug>` deep link: the substance the tab opens on. */
  initialSlug?: string;
}











export type SortOrder = "alpha-asc" | "alpha-desc";
export type ReviewStatus = "needed" | "in_progress" | "completed";

export const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; tone: EditorStatusPillTone }> = {
  needed: { label: "Review Needed", tone: "danger" },
  in_progress: { label: "In Progress", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
};

export interface SubstanceInfo {
  slug: string;
  name: string;
  reviewStatus: ReviewStatus;
}




