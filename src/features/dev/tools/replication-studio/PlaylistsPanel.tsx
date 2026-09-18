"use client";

import { useId, useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyStateSurface } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { ActionNotice, EditorSection, EditorStatusPill } from "@/features/dev/components";

import type { ReplicationPlaylistSummary } from "./replicationPlaylistModel";
import type { StudioRow } from "./replicationStudioModel";
import { usePlaylistsController } from "./usePlaylistsController";
import { VisualPlaylistComposer } from "./VisualPlaylistComposer";

export type PlaylistsPanelProps = {
  /** Complete corpus: selected members must remain resolvable when the rail filters them out. */
  allRows: readonly StudioRow[];
  /** Current search/facet result: only the add-candidate grid follows the rail. */
  filteredRows: readonly StudioRow[];
  onDirtyChange?: (dirty: boolean) => void;
  /** Feature integration point for actions that operate on one stored playlist. */
  renderSavedPlaylistAction?: (playlist: ReplicationPlaylistSummary) => ReactNode;
};

function PlaylistRow({
  playlist,
  active,
  deleting,
  actionsDisabled,
  action,
  onOpen,
  onRequestDelete,
}: {
  playlist: ReplicationPlaylistSummary;
  active: boolean;
  deleting: boolean;
  actionsDisabled: boolean;
  action?: ReactNode;
  onOpen: (playlist: ReplicationPlaylistSummary) => void;
  onRequestDelete: (playlist: ReplicationPlaylistSummary) => void;
}) {
  return (
    <li className="grid gap-2 border-b border-[color:var(--editor-panel-border)] py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="theme-text-primary truncate text-sm font-medium">{playlist.title}</p>
          {active ? <EditorStatusPill tone="info">Editing</EditorStatusPill> : null}
        </div>
        <p className="theme-text-faint truncate text-xs">
          {playlist.work_count} {playlist.work_count === 1 ? "work" : "works"} · saved {playlist.updated_at.slice(0, 10)} by {playlist.updated_by ?? "unknown"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        {action}
        <Button type="button" variant="secondary" size="sm" disabled={deleting || actionsDisabled} onClick={() => onOpen(playlist)}>
          <Icon icon="lucide:pencil" size={14} />
          Edit
        </Button>
        <Button
          type="button"
          variant="ghostDestructive"
          size="icon"
          className={`h-8 w-8 ${TOUCH_ICON}`}
          disabled={deleting || actionsDisabled}
          aria-label={deleting ? `Deleting ${playlist.title}` : `Delete ${playlist.title}`}
          onClick={() => onRequestDelete(playlist)}
        >
          <Icon icon={deleting ? "lucide:loader-circle" : "lucide:trash-2"} size={14} />
        </Button>
      </div>
    </li>
  );
}

export function PlaylistsPanel({
  allRows,
  filteredRows,
  onDirtyChange,
  renderSavedPlaylistAction,
}: PlaylistsPanelProps) {
  const controller = usePlaylistsController({ onDirtyChange });
  const {
    playlists,
    loaded,
    draft,
    isDirty,
    pendingTransition,
    deletingKeys,
    saveState,
    isSaving,
    feedback,
  } = controller;
  const [deleteTarget, setDeleteTarget] = useState<ReplicationPlaylistSummary | null>(null);
  const titleFieldId = useId();

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:list-music"
      title="Playlists"
      description="Build and save reusable visual sequences without changing any drug gallery. Apply to drugs is a separate, explicit one-time write to the selected stored galleries."
      actions={
        <Button type="button" variant="accent" size="sm" disabled={isSaving} onClick={controller.startNewPlaylist}>
          <Icon icon="lucide:plus" size={15} />
          New playlist
        </Button>
      }
    >
      {feedback ? (
        <ActionNotice tone={feedback.tone} onDismiss={() => controller.setFeedback(null)}>
          {feedback.message}
        </ActionNotice>
      ) : null}

      <section aria-labelledby="saved-playlists-heading" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 id="saved-playlists-heading" className="theme-text-primary text-sm font-semibold">Saved playlists</h4>
            <p className="theme-text-muted text-xs">Open one to edit its order or apply it to drugs.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={controller.reload}>
            <Icon icon="lucide:refresh-cw" size={15} />
            Reload
          </Button>
        </div>

        {!loaded ? (
          <p className="theme-text-muted py-3 text-sm">Loading playlists…</p>
        ) : playlists.length === 0 ? (
          <EmptyStateSurface padding="sm" radius="lg" className="space-y-1 text-sm">
            <p className="theme-text-primary font-medium">No saved playlists yet.</p>
            <p className="theme-text-muted">Start a playlist, add media, and save it before applying it to drugs.</p>
          </EmptyStateSurface>
        ) : (
          <ul className="border-y border-[color:var(--editor-panel-border)]">
            {playlists.map((playlist) => (
              <PlaylistRow
                key={playlist.key}
                playlist={playlist}
                active={draft?.key === playlist.key}
                deleting={deletingKeys.has(playlist.key)}
                action={renderSavedPlaylistAction?.(playlist)}
                actionsDisabled={isSaving}
                onOpen={controller.openPlaylist}
                onRequestDelete={setDeleteTarget}
              />
            ))}
          </ul>
        )}
      </section>

      {draft ? (
        <section aria-labelledby="playlist-editor-heading" className="space-y-4 border-t border-[color:var(--editor-panel-border)] pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[min(100%,18rem)] flex-1 space-y-1">
              <label htmlFor={titleFieldId} className="theme-text-muted block text-[11px] uppercase tracking-[0.24em]">
                Playlist name
              </label>
              <Input
                id={titleFieldId}
                value={draft.title}
                placeholder="Classic psychedelic opener"
                disabled={isSaving}
                onChange={(event) => controller.setDraftTitle(event.target.value)}
              />
            </div>
            <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={controller.closeDraft}>
              <Icon icon="lucide:x" size={15} />
              Close
            </Button>
          </div>

          <div>
            <h4 id="playlist-editor-heading" className="sr-only">
              {draft.title.trim().length > 0 ? `Edit ${draft.title}` : "Edit new playlist"}
            </h4>
            <VisualPlaylistComposer
              allRows={allRows}
              filteredRows={filteredRows}
              order={draft.slugs}
              isDirty={isDirty}
              disabled={isSaving}
              saveState={saveState}
              onOrderChange={controller.setDraftSlugs}
              onSave={() => void controller.save()}
              onReset={controller.resetDraft}
            />
          </div>
        </section>
      ) : (
        <EmptyStateSurface padding="sm" radius="lg" className="space-y-1 text-sm">
          <p className="theme-text-primary font-medium">Choose a saved playlist or start a new one.</p>
          <p className="theme-text-muted">The editor will replace this prompt without covering the library workspace.</p>
        </EmptyStateSurface>
      )}

      <Dialog
        open={pendingTransition !== null}
        onOpenChange={(open) => {
          if (!open) controller.cancelPendingTransition();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard the unsaved playlist?</DialogTitle>
            <DialogDescription>
              This draft has changes that are not saved. Continue only if you want to discard them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={isSaving} onClick={controller.cancelPendingTransition}>
              Keep editing
            </Button>
            <Button type="button" variant="destructive" disabled={isSaving} onClick={controller.discardPendingTransition}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.title ?? "this playlist"}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the saved playlist. Existing drug galleries are unchanged because playlist application is a one-time copy.
              {deleteTarget && draft?.key === deleteTarget.key && isDirty
                ? " Your unsaved edits to this playlist will also be discarded."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isSaving || Boolean(deleteTarget && deletingKeys.has(deleteTarget.key))}
              onClick={() => {
                if (isSaving) return;
                if (!deleteTarget) return;
                const target = deleteTarget;
                setDeleteTarget(null);
                void controller.remove(target);
              }}
            >
              Delete playlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EditorSection>
  );
}
