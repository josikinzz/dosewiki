import type { ReactNode } from "react";
import type { DevCommitControls } from "@/features/dev/pages/useDevModeSaveActions";
import type { EditorStatusPillTone } from "@/features/dev/components";
import type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualIndexConfig,
} from "@/data/builders/manualIndexLoader";

export type { ManualCategoryDefinition, ManualCategorySection, ManualIndexConfig };

export interface IndexLayoutTabProps {
  commitPanel?: ReactNode;
  commit?: DevCommitControls;
  datasetMarkdown?: string;
  hasDatasetChanges?: boolean;
  onCopyDatasetMarkdown?: () => Promise<void>;
  onDownloadDatasetMarkdown?: () => void;
  enableStickyPanels?: boolean;
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

export const slugIssueTones: Record<SlugIssue, EditorStatusPillTone> = {
  missing: "danger",
  hidden: "warning",
};

export const slugIssueNotes: Record<SlugIssue, string> = {
  missing: "No article answers this slug, so the site leaves it out.",
  hidden: "Hidden or direct-link only, so readers do not see it here.",
};
