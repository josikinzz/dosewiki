"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { StudioWorkspace } from "./ReplicationStudioWorkspaceNav";

export type PendingPlaylistLeave =
  | { kind: "workspace"; next: StudioWorkspace }
  | { kind: "review"; substanceSlug: string };

export function ReplicationStudioLeaveDialogs({
  pendingPlaylistLeave,
  pendingShowcaseLeave,
  onCancelPlaylistLeave,
  onConfirmPlaylistLeave,
  onCancelShowcaseLeave,
  onConfirmShowcaseLeave,
}: {
  pendingPlaylistLeave: PendingPlaylistLeave | null;
  pendingShowcaseLeave: { next: StudioWorkspace } | null;
  onCancelPlaylistLeave: () => void;
  onConfirmPlaylistLeave: () => void;
  onCancelShowcaseLeave: () => void;
  onConfirmShowcaseLeave: () => void;
}) {
  return (
    <>
      <Dialog
        open={pendingPlaylistLeave !== null}
        onOpenChange={(open) => {
          if (!open) onCancelPlaylistLeave();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Playlists with unsaved changes?</DialogTitle>
            <DialogDescription>
              The open playlist has changes that were never saved. Leaving this workspace discards
              them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancelPlaylistLeave}>
              Keep editing
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirmPlaylistLeave}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingShowcaseLeave !== null}
        onOpenChange={(open) => {
          if (!open) onCancelShowcaseLeave();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave the showcase with unsaved changes?</DialogTitle>
            <DialogDescription>
              This board has curation that was never saved. Leaving now throws it away; the article
              keeps whatever is already stored.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancelShowcaseLeave}>
              Keep editing
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirmShowcaseLeave}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
