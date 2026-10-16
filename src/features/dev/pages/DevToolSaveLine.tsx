"use client";

import { Icon } from "@/components/common/Icon";
import { saveLineCopy, type SaveDestination, WRITE_FREEZE_COPY } from "@/features/dev/components";
import { useWriteFreeze } from "../components/writeFreeze";
import type { DevTabDescriptor } from "./devTabRegistry";

export function saveDestinationFor(tab: DevTabDescriptor, canApprove: boolean): SaveDestination {
  if (canApprove || tab.withoutApproval === undefined) {
    return "live";
  }
  return tab.withoutApproval === "submits-for-review" ? "proposal" : "read-only";
}

export function shellOwnsSaveLine(tab: DevTabDescriptor): boolean {
  return tab.group !== "chrome" && tab.destination.kind === "shell" && tab.saveLine === undefined;
}

export function DevWriteStatus({ tab, canApprove, ready }: { tab: DevTabDescriptor; canApprove: boolean; ready: boolean }) {
  const freeze = useWriteFreeze();
  if (freeze.frozen) {
    return (
      <p role="status" data-tone="frozen" className="theme-dev-write-status mt-2 flex items-start gap-2.5 rounded-card border px-3 py-2 text-sm">
        <Icon icon={WRITE_FREEZE_COPY.icon} size={16} className="theme-dev-write-status-icon mt-0.5 shrink-0" />
        <span>
          <span className="font-semibold">{WRITE_FREEZE_COPY.label}</span>{" "}
          <span>{WRITE_FREEZE_COPY.detail}</span>
        </span>
      </p>
    );
  }
  if (!ready || !shellOwnsSaveLine(tab)) {
    return null;
  }
  const copy = saveLineCopy(tab.saveModel, saveDestinationFor(tab, canApprove));
  return (
    <p data-tone={copy.tone} className="theme-dev-write-status mt-2 flex items-start gap-2 px-1.5 text-sm">
      <Icon icon={copy.icon} size={15} className="theme-dev-write-status-icon mt-0.5 shrink-0" />
      <span>
        <span className="theme-text-secondary font-medium">{copy.label}</span>{" "}
        <span>{copy.detail}</span>
      </span>
    </p>
  );
}
