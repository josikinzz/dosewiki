import type { ReactNode } from "react";
import {
  DevCommitCard,
  type DevCommitDestination,
  type DevCommitNotice,
  type DevCommitRebase,
} from "../components/DevCommitCard";

type DevModeCommitPanelProps = {
  notice: DevCommitNotice | null;
  destination: DevCommitDestination;
  actionSlot?: ReactNode;
  description?: ReactNode;
  rebase?: DevCommitRebase | null;
  onDismissNotice?: () => void;
};

export function DevModeCommitPanel({
  notice,
  destination,
  actionSlot,
  description,
  rebase,
  onDismissNotice,
}: DevModeCommitPanelProps) {
  return (
    <DevCommitCard
      notice={notice}
      destination={destination}
      actionSlot={actionSlot}
      description={description}
      rebase={rebase}
      onDismissNotice={onDismissNotice}
    />
  );
}
