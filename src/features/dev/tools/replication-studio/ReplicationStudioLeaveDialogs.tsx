"use client";

import { ConfirmDialog, type ConfirmRequest } from "@/features/dev/components";

function discardRequest(title: string, description: string, onConfirm: () => void): ConfirmRequest {
  return { title, description, cancelLabel: "Keep editing", confirmLabel: "Discard changes", destructive: true, onConfirm };
}

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
  pendingPlaylistLeave: boolean;
  pendingShowcaseLeave: boolean;
  onCancelPlaylistLeave: () => void;
  onConfirmPlaylistLeave: () => void;
  onCancelShowcaseLeave: () => void;
  onConfirmShowcaseLeave: () => void;
  pendingDraftDiscard: boolean;
  onCancelDraftDiscard: () => void;
  onConfirmDraftDiscard: () => void;
}) {
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
