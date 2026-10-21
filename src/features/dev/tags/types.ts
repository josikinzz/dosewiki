import type { ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import type { TagField } from "@/data/tags/tagRegistry";
import type { DevCommitControls } from "../pages/useDevModeSaveActions";

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

export type TagUndo = {
  source: Exclude<NoticeSource, "diff">;
  action: string;
  before: readonly SubstanceArticle[];
  after: readonly SubstanceArticle[];
  changedIndexes: readonly number[];
  selection: { activeField: TagField; selected: SelectedTag | null };
};

export type TagEditorTabProps = {
  commitPanel?: ReactNode;
  commit?: DevCommitControls;
  datasetMarkdown: string;
  hasDatasetChanges: boolean;
  onCopyDatasetMarkdown: () => Promise<void>;
  onDownloadDatasetMarkdown: () => void;
};
