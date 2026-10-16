"use client";

import { useUnsavedWork } from "@/features/dev/components";

import type { ContributorsController } from "./useContributorsController";

export function useContributorUnsavedWork(
  controller: ContributorsController,
  tab: "contributors" | "people",
  toolLabel: string,
): void {
  const { detail, isProfileDirty, isWorkOrderDirty, isReportOrderDirty, discardProfile, resetWorkOrder, resetReportOrder } = controller;
  const who = detail?.profile.displayName ?? "this contributor";
  useUnsavedWork({
    kind: "discard-only",
    because: "This change would go live. Publish it from the tool; leaving here never publishes.",
    id: `${tab}:profile`,
    tab,
    label: `${toolLabel}: profile of ${who}`,
    dirty: isProfileDirty,
    discard: discardProfile,
  });
  useUnsavedWork({
    kind: "discard-only",
    because: "This change would go live. Publish it from the tool; leaving here never publishes.",
    id: `${tab}:work-order`,
    tab,
    label: `${toolLabel}: order of ${who}'s works`,
    dirty: isWorkOrderDirty,
    discard: resetWorkOrder,
  });
  useUnsavedWork({
    kind: "discard-only",
    because: "This change would go live. Publish it from the tool; leaving here never publishes.",
    id: `${tab}:report-order`,
    tab,
    label: `${toolLabel}: order of ${who}'s reports`,
    dirty: isReportOrderDirty,
    discard: resetReportOrder,
  });
}
