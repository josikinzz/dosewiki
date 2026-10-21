import type { ConfirmRequest } from "@/features/dev/components";

export function loadLatestConfirm(onConfirm: () => void): ConfirmRequest {
  return {
    title: "Load the latest version?",
    description: "The canvas reloads the depiction someone else saved. Your edits on the canvas are dropped.",
    confirmLabel: "Drop my edits and load",
    destructive: true,
    onConfirm,
  };
}
