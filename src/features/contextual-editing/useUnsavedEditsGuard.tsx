"use client";

import { useDirtyGuard } from "@/features/dev/components/useDirtyGuard";

export const UNSAVED_EDITS_TITLE = "Unsaved changes";

/**
 * The one unsaved-changes dialog for in-page editing. The launcher asks it
 * before leaving the page or edit mode; the article editor asks it before
 * closing a section, with Cancel and Escape taking the same path. Both read
 * the same title and words, and no option ever publishes.
 */
export function useUnsavedEditsGuard(dirty: boolean, options: {
  onSave?: () => Promise<void>;
  onDiscard: () => void;
  /** False while a publication is unconfirmed; the dialog then offers only Keep editing. */
  canDiscard?: boolean;
  /** Why saving is unavailable, when it is. */
  reason?: string;
  container?: HTMLElement | null;
  warnOnUnload?: boolean;
}) {
  const canDiscard = options.canDiscard !== false;
  const description = !canDiscard
    ? "Return to the open editor to save, discard, or reconcile its pending publication before leaving."
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
