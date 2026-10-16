"use client";

import { useDirtyGuard } from "@/features/dev/components/useDirtyGuard";

export const UNSAVED_EDITS_TITLE = "Unsaved changes";

export function useUnsavedEditsGuard(dirty: boolean, options: {
  onSave?: () => Promise<void>;
  onDiscard: () => void;
  canDiscard?: boolean;
  reason?: string;
  container?: HTMLElement | null;
  warnOnUnload?: boolean;
}) {
  const canDiscard = options.canDiscard !== false;
  const description = !canDiscard
    ? "Return to the open editor to save, discard, or retry its unconfirmed publication before leaving."
    : options.onSave
      ? "Save a private draft, discard your changes, or keep editing. Nothing is published by leaving."
      : "Discard your changes or keep editing. Nothing is published by leaving.";
  return useDirtyGuard(dirty, {
    title: UNSAVED_EDITS_TITLE,
    description: options.reason ? `${options.reason} ${description}` : description,
    onSave: options.onSave,
    onDiscard: options.onDiscard,
    canDiscard,
    container: options.container,
    warnOnUnload: options.warnOnUnload,
  });
}
