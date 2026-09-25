"use client";

import { SaveLine, type SaveDestination } from "@/features/dev/components";
import type { DevTabDescriptor } from "./devTabRegistry";

/** Where this member's save goes in a tool, read off the descriptor. */
export function saveDestinationFor(tab: DevTabDescriptor, canApprove: boolean): SaveDestination {
  if (canApprove || tab.withoutApproval === undefined) {
    return "live";
  }
  return tab.withoutApproval === "submits-for-review" ? "proposal" : "read-only";
}

/**
 * The shell's save line for the active tool, read off the registry descriptor
 * so a tool cannot say one thing and do another. Only tools the shell renders
 * get one: the chrome cluster (Change log) is not a tool, an external
 * destination (Review) never renders here, and a descriptor with `saveLine`
 * set either draws it beside its own primary action or has none.
 */
export function DevToolSaveLine({ tab, canApprove }: { tab: DevTabDescriptor; canApprove: boolean }) {
  if (tab.group === "chrome" || tab.destination.kind !== "shell" || tab.saveLine !== undefined) {
    return null;
  }
  return (
    <div className="mt-4 flex justify-end">
      <SaveLine model={tab.saveModel} destination={saveDestinationFor(tab, canApprove)} />
    </div>
  );
}
