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
  /** The shell's commit card, drawn only when `commit` is not given (a bare mount). */
  commitPanel?: ReactNode;
  /** The commit in parts, for the tool's own Working changes panel. */
  commit?: DevCommitControls;
  /** Every working change as one diff (every tool), for the folded diff. */
  datasetMarkdown?: string;
  hasDatasetChanges?: boolean;
  onCopyDatasetMarkdown?: () => Promise<void>;
  onDownloadDatasetMarkdown?: () => void;
  /** Kept for the shell's call; the tool's dock sticks at every pointer now. */
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

/** Slug-issue severity on the shared pill tones: a missing slug never renders, a hidden one renders nowhere public. */
export const slugIssueTones: Record<SlugIssue, EditorStatusPillTone> = {
  missing: "danger",
  hidden: "warning",
};

/** What each issue means for a reader, said in the row's menu. */
export const slugIssueNotes: Record<SlugIssue, string> = {
  missing: "No article answers this slug, so the site leaves it out.",
  hidden: "Hidden or direct-link only, so readers do not see it here.",
};
