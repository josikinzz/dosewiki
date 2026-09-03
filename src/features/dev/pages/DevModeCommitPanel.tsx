import type { ReactNode } from "react";
import { DevCommitCard, type DevCommitNotice } from "../components/DevCommitCard";

type DevModeCommitPanelProps = {
  notice: DevCommitNotice | null;
  hasEditorSession: boolean;
  submitterKey: string | null;
  hasInvalidJsonDraft: boolean;
  isSaving: boolean;
  isCommitDisabled: boolean;
  onCommit: () => void;
  actionSlot?: ReactNode;
  /** Tab-specific panel copy; falls back to the neutral DevCommitCard default. */
  description?: ReactNode;
};

export function DevModeCommitPanel({
  notice,
  hasEditorSession,
  submitterKey,
  hasInvalidJsonDraft,
  isSaving,
  isCommitDisabled,
  onCommit,
  actionSlot,
  description,
}: DevModeCommitPanelProps) {
  return (
    <DevCommitCard
      notice={notice}
      hasEditorSession={hasEditorSession}
      submitterKey={submitterKey}
      hasInvalidJsonDraft={hasInvalidJsonDraft}
      isSaving={isSaving}
      isCommitDisabled={isCommitDisabled}
      onCommit={onCommit}
      actionSlot={actionSlot}
      description={description}
    />
  );
}
