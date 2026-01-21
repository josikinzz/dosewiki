import type { ReactNode } from "react";
import type { TagField, TagUsage } from "@/utils/data/tagRegistry";

export type Notice = {
  type: "success" | "error";
  message: string;
};

export type SelectedTag = {
  field: TagField;
  key: string;
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
