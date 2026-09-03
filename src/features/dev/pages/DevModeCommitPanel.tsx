import type { ReactNode } from "react";
import { DevCommitCard, type DevCommitNotice } from "../components/DevCommitCard";

type DevModeCommitPanelProps = {
  notice: DevCommitNotice | null;
  actionSlot?: ReactNode;
  /** Tab-specific panel copy; falls back to the neutral DevCommitCard default. */
  description?: ReactNode;
};

export function DevModeCommitPanel({ notice, actionSlot, description }: DevModeCommitPanelProps) {
  return <DevCommitCard notice={notice} actionSlot={actionSlot} description={description} />;
}
