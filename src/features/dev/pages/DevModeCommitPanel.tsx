import type { ReactNode } from "react";
import { DevCommitCard, type DevCommitNotice } from "../components/DevCommitCard";

type BaseCommitPanelProps = {
  notice: DevCommitNotice | null;
  hasEditorSession: boolean;
  passwordKey: string | null;
  hasInvalidJsonDraft: boolean;
  isSaving: boolean;
  onCommit: () => void;
  /** Tab-specific panel copy; falls back to the neutral DevCommitCard default. */
  description?: ReactNode;
};

type DevModeCommitPanelProps = BaseCommitPanelProps & {
  isCommitDisabled: boolean;
  actionSlot?: ReactNode;
};

type DevModeCreateCommitPanelProps = BaseCommitPanelProps & {
  isCommitDisabled: boolean;
  footerSlot: ReactNode;
};

export function DevModeCommitPanel({
  notice,
  hasEditorSession,
  passwordKey,
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
      passwordKey={passwordKey}
      hasInvalidJsonDraft={hasInvalidJsonDraft}
      isSaving={isSaving}
      isCommitDisabled={isCommitDisabled}
      onCommit={onCommit}
      actionSlot={actionSlot}
      description={description}
    />
  );
}

export function DevModeCreateCommitPanel({
  notice,
  hasEditorSession,
  passwordKey,
  hasInvalidJsonDraft,
  isSaving,
  isCommitDisabled,
  onCommit,
  footerSlot,
  description,
}: DevModeCreateCommitPanelProps) {
  return (
    <DevCommitCard
      notice={notice}
      hasEditorSession={hasEditorSession}
      passwordKey={passwordKey}
      hasInvalidJsonDraft={hasInvalidJsonDraft}
      isSaving={isSaving}
      isCommitDisabled={isCommitDisabled}
      onCommit={onCommit}
      footerSlot={footerSlot}
      description={description}
    />
  );
}
