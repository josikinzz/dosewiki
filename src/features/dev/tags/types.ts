import type { ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import type { TagField } from "@/utils/data/tagRegistry";
import type { DevCommitControls } from "../pages/useDevModeSaveActions";

/** Which form/action produced a notice, so feedback renders next to it. */
export type NoticeSource = "rename" | "move" | "delete" | "diff";

export type TagNoticeState = {
  type: "success" | "error";
  message: string;
  source: NoticeSource;
};

export type SelectedTag = {
  field: TagField;
  key: string;
};

/**
 * Everything needed to put the last rewrite back: the rows as they were
 * before and after, keyed by working-set index, and where the editor was
 * looking. A row edited since the rewrite is left alone on undo.
 */
export type TagUndo = {
  source: Exclude<NoticeSource, "diff">;
  /** Past-tense name of the rewrite, e.g. "Rename". */
  action: string;
  before: readonly SubstanceArticle[];
  after: readonly SubstanceArticle[];
  changedIndexes: readonly number[];
  selection: { activeField: TagField; selected: SelectedTag | null };
};

export type TagEditorTabProps = {
  /** The shell's commit panel; drawn only when `commit` is not given. */
  commitPanel?: ReactNode;
  /** The commit in parts, for Tags' own working-changes panel. */
  commit?: DevCommitControls;
  datasetMarkdown: string;
  hasDatasetChanges: boolean;
  onCopyDatasetMarkdown: () => Promise<void>;
  onDownloadDatasetMarkdown: () => void;
};
