import type { ReactNode } from "react";
import type { EditorStatusPillTone } from "@/features/dev/components";
import type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualIndexConfig,
} from "@/data/builders/manualIndexLoader";

export type { ManualCategoryDefinition, ManualCategorySection, ManualIndexConfig };

export interface IndexLayoutTabProps {
  commitPanel?: ReactNode;
  /** Fine-pointer only: the action toolbar sticks to the top of the board. */
  enableStickyPanels: boolean;
}

export type SubstanceOption = {
  slug: string;
  name: string;
  alias?: string;
  isHidden: boolean;
};

export type SlugIssue = "missing" | "hidden";

export type ManualDatasetKey = "psychoactive" | "chemical" | "mechanism";

export const slugIssueLabels: Record<SlugIssue, string> = {
  missing: "Missing",
  hidden: "Hidden",
};

/** Slug-issue severity on the shared pill tones: a missing slug never renders, a hidden one renders nowhere public. */
export const slugIssueTones: Record<SlugIssue, EditorStatusPillTone> = {
  missing: "danger",
  hidden: "warning",
};
