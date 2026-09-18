import type { ReactNode } from "react";
import {
  DevCommitCard,
  type DevCommitDestination,
  type DevCommitNotice,
  type DevCommitRebase,
} from "../components/DevCommitCard";

type DevModeCommitPanelProps = {
  notice: DevCommitNotice | null;
  /** Where the primary action sends the draft; the card's title and copy follow it. */
  destination: DevCommitDestination;
  actionSlot?: ReactNode;
  /** Tab-specific panel copy; falls back to the neutral DevCommitCard default. */
  description?: ReactNode;
  /** The returned proposal the draft rebases, when the working set was seeded from one. */
  rebase?: DevCommitRebase | null;
};

export function DevModeCommitPanel({ notice, destination, actionSlot, description, rebase }: DevModeCommitPanelProps) {
  return (
    <DevCommitCard
      notice={notice}
      destination={destination}
      actionSlot={actionSlot}
      description={description}
      rebase={rebase}
    />
  );
}
