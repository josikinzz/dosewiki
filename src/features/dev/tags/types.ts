import type { ReactNode } from "react";
import type { DevNoticeStatus } from "@/features/dev/notices/devNoticeLifecycle";
import type { SubstanceArticle } from "@/schema";
import type { TagField, TagUsage } from "@/utils/data/tagRegistry";

/** Which form/action produced a notice, so feedback renders next to it. */
export type NoticeSource = "rename" | "move" | "delete" | "diff";

export type Notice = {
  type: Extract<DevNoticeStatus, "success" | "error">;
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
  commitPanel?: ReactNode;
  datasetMarkdown: string;
  hasDatasetChanges: boolean;
  onCopyDatasetMarkdown: () => Promise<void>;
  onDownloadDatasetMarkdown: () => void;
};

export type TagListPanelProps = {
  activeField: TagField;
  onFieldChange: (field: TagField) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredTags: TagUsage[];
  selected: SelectedTag | null;
  onSelectUsage: (usage: TagUsage) => void;
};

export type TagDetailPanelProps = {
  selectedUsage: TagUsage;
};

export type TagMutationFormsProps = {
  selectedUsage: TagUsage;
  notice: Notice | null;
  undo: TagUndo | null;
  onUndo: () => void;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRename: (e: React.FormEvent<HTMLFormElement>) => void;
  moveTargetField: TagField;
  onMoveTargetFieldChange: (field: TagField) => void;
  moveLabel: string;
  onMoveLabelChange: (value: string) => void;
  keepSourceCopy: boolean;
  onKeepSourceCopyChange: (checked: boolean) => void;
  onMove: (e: React.FormEvent<HTMLFormElement>) => void;
  deleteConfirmed: boolean;
  onDeleteConfirmedChange: (checked: boolean) => void;
  onDelete: () => void;
  isApplying: boolean;
};
