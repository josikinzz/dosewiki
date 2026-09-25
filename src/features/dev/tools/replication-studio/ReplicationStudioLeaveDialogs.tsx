"use client";

import { ConfirmDialog, type ConfirmRequest } from "@/features/dev/components";

import type { StudioWorkspace } from "./ReplicationStudioWorkspaceNav";

export type PendingPlaylistLeave =
  | { kind: "workspace"; next: StudioWorkspace }
  | { kind: "review"; substanceSlug: string };

/** Every in-tool discard asks the same way: keep editing, or throw the draft away. */
function discardRequest(title: string, description: string, onConfirm: () => void): ConfirmRequest {
  return { title, description, cancelLabel: "Keep editing", confirmLabel: "Discard changes", destructive: true, onConfirm };
}

/**
 * The studio's own switch guards: moving between its workspaces or subjects
 * inside the tool. Rail clicks, Leave and unload go through the shell's
 * unsaved-work registry instead.
 */
export function ReplicationStudioLeaveDialogs({
  pendingPlaylistLeave,
  pendingShowcaseLeave,
  onCancelPlaylistLeave,
  onConfirmPlaylistLeave,
  onCancelShowcaseLeave,
  onConfirmShowcaseLeave,
  pendingDraftDiscard,
  onCancelDraftDiscard,
  onConfirmDraftDiscard,
}: {
  pendingPlaylistLeave: PendingPlaylistLeave | null;
  pendingShowcaseLeave: { next: StudioWorkspace } | null;
  onCancelPlaylistLeave: () => void;
  onConfirmPlaylistLeave: () => void;
  onCancelShowcaseLeave: () => void;
  onConfirmShowcaseLeave: () => void;
  pendingDraftDiscard: boolean;
  onCancelDraftDiscard: () => void;
  onConfirmDraftDiscard: () => void;
}) {
  // Confirm runs its action and then closes, so each cancel is a no-op once
  // the confirm has already cleared its pending state.
  return (
    <>
      <ConfirmDialog
        request={
          pendingPlaylistLeave
            ? discardRequest(
                "Leave Playlists with unsaved changes?",
                "The open playlist has changes that were never saved. Leaving this workspace discards them.",
                onConfirmPlaylistLeave,
              )
            : null
        }
        onClose={onCancelPlaylistLeave}
      />
      <ConfirmDialog
        request={
          pendingShowcaseLeave
            ? discardRequest(
                "Leave the showcase with unsaved changes?",
                "This board has curation that was never saved. Leaving now throws it away; the article keeps whatever is already stored.",
                onConfirmShowcaseLeave,
              )
            : null
        }
        onClose={onCancelShowcaseLeave}
      />
      <ConfirmDialog
        request={
          pendingDraftDiscard
            ? discardRequest(
                "Discard unsaved edits?",
                "The work open in the inspector has changes that were never saved. Moving on throws them away; the live site keeps what is already stored.",
                onConfirmDraftDiscard,
              )
            : null
        }
        onClose={onCancelDraftDiscard}
      />
    </>
  );
}
