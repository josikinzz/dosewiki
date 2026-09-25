"use client";

import { useUnsavedWork } from "@/features/dev/components";

import type { ContributorsController } from "./useContributorsController";

/**
 * Reports a loaded profile's unsaved work to the shell: the profile draft and
 * each unsaved order, one entry per scope, under the rail tab that shows it
 * (`contributors`, or `people` where the profile sits beside its account).
 * Each save goes live on the public contributor page at once, so the shell
 * only discards; saving stays with the editor's own buttons.
 */
export function useContributorUnsavedWork(
  controller: ContributorsController,
  tab: "contributors" | "people",
  toolLabel: string,
): void {
  const { detail, isProfileDirty, isWorkOrderDirty, isReportOrderDirty, discardProfile, resetWorkOrder, resetReportOrder } = controller;
  const who = detail?.profile.displayName ?? "this contributor";
  useUnsavedWork({
    id: `${tab}:profile`,
    tab,
    label: `${toolLabel}: profile of ${who}`,
    dirty: isProfileDirty,
    publishesLive: true,
    discard: discardProfile,
  });
  useUnsavedWork({
    id: `${tab}:work-order`,
    tab,
    label: `${toolLabel}: order of ${who}'s works`,
    dirty: isWorkOrderDirty,
    publishesLive: true,
    discard: resetWorkOrder,
  });
  useUnsavedWork({
    id: `${tab}:report-order`,
    tab,
    label: `${toolLabel}: order of ${who}'s reports`,
    dirty: isReportOrderDirty,
    publishesLive: true,
    discard: resetReportOrder,
  });
}
