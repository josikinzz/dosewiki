"use client";

/**
 * Playlists: `/dev/playlists`. A member's own replication playlists: the
 * ordered sets of works the replication studio applies to substance galleries.
 * A contributor sees and edits the playlists they own; an editor sees every
 * playlist but edits only their own; an admin edits all of them and may hand
 * one to a member. Ownership is enforced in Convex; this tab only hides what
 * the route already refuses.
 *
 * Nothing here publishes. A playlist reaches the public site only when an
 * admin applies it to a gallery in the studio.
 */

import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditorNotice, EditorSection, EditorStatusPill, type EditorNoticeMessage } from "@/features/dev/components";

import { PlaylistEditor } from "./PlaylistEditor";
import {
  EMPTY_DRAFT,
  assignPlaylistOwner,
  deletePlaylist,
  draftOf,
  fetchPlaylists,
  isDraftDirty,
  savePlaylist,
  type OwnedPlaylist,
  type PlaylistDraft,
} from "./playlistsModel";

export type PlaylistsTabProps = {
  /** Admin: sees every playlist's owner and may reassign it. */
  isAdmin: boolean;
};

export function PlaylistsTab({ isAdmin }: PlaylistsTabProps) {
  const [playlists, setPlaylists] = useState<OwnedPlaylist[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [draft, setDraft] = useState<PlaylistDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OwnedPlaylist | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setPlaylists(await fetchPlaylists());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load playlists.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saved = draft && draft.expectedUpdatedAt !== null
    ? (playlists?.find((entry) => entry.key === draft.key) ?? null)
    : null;
  const isDirty = draft ? isDraftDirty(draft, saved) : false;

  /** Runs one write, reloads the list, and reports the outcome. */
  const run = useCallback(
    async (action: () => Promise<string>) => {
      setBusy(true);
      setNotice(null);
      try {
        const success = await action();
        await load();
        setNotice({ tone: "success", message: success });
      } catch (error) {
        setNotice({
          tone: "danger",
          message: error instanceof Error ? error.message : "The change did not go through.",
        });
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const save = () => {
    if (!draft) return;
    const creating = draft.expectedUpdatedAt === null;
    void run(async () => {
      const stored = await savePlaylist(draft, { sendOwner: isAdmin && creating });
      setDraft(draftOf(stored));
      const dropped =
        stored.pruned.length > 0
          ? ` ${stored.pruned.length} ${stored.pruned.length === 1 ? "entry" : "entries"} named a work that does not exist or is excluded everywhere, and ${stored.pruned.length === 1 ? "was" : "were"} dropped.`
          : "";
      return `${creating ? "Created" : "Saved"} "${stored.title}".${dropped}`;
    });
  };

  const assignOwner = () => {
    if (!draft || draft.expectedUpdatedAt === null) return;
    const ownerEmail = draft.ownerEmail.trim().toLowerCase();
    void run(async () => {
      await assignPlaylistOwner(draft.key, ownerEmail.length > 0 ? ownerEmail : null);
      return ownerEmail.length > 0
        ? `"${draft.title}" now belongs to ${ownerEmail}.`
        : `"${draft.title}" is unowned and admin-only again.`;
    });
  };

  const remove = (target: OwnedPlaylist) => {
    setDeleteTarget(null);
    void run(async () => {
      await deletePlaylist(target.key);
      setDraft((current) => (current?.key === target.key ? null : current));
      return `Deleted "${target.title}".`;
    });
  };

  return (
    <div className="space-y-10">
      <EditorSection
        icon="lucide:list-music"
        title="Playlists"
        description={
          isAdmin
            ? "Every saved replication playlist and who owns it. Applying one to a gallery happens in the replication studio."
            : "Your replication playlists: ordered sets of works an admin can apply to a substance gallery. Saving here publishes nothing."
        }
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
              <Icon icon="lucide:refresh-cw" size={14} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={busy || (draft !== null && draft.expectedUpdatedAt === null)}
              onClick={() => setDraft({ ...EMPTY_DRAFT })}
            >
              <Icon icon="lucide:plus" size={14} />
              New playlist
            </Button>
          </>
        }
      >
        {notice ? <EditorNotice notice={notice} /> : null}

        {loadError ? (
          <StateCard
            tone="danger"
            icon="lucide:circle-alert"
            title="Playlists did not load"
            description={loadError}
            compact
            actions={
              <Button type="button" variant="accent" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        ) : playlists === null ? (
          <StateCard tone="accent" loading title="Loading playlists" description="Fetching your playlists." compact />
        ) : playlists.length === 0 ? (
          <StateCard
            tone="neutral"
            icon="lucide:list-music"
            title="No playlists yet"
            description="Start one with New playlist, name it, and add works by their replication slug."
            compact
          />
        ) : (
          <ul className="border-y border-[color:var(--editor-panel-border)]">
            {playlists.map((playlist) => (
              <li
                key={playlist.key}
                data-playlist={playlist.key}
                className="grid gap-2 border-b border-[color:var(--editor-panel-border)] py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="theme-text-primary truncate text-sm font-medium">{playlist.title}</p>
                    {draft?.key === playlist.key ? <EditorStatusPill tone="info">Editing</EditorStatusPill> : null}
                    {!playlist.editable ? <EditorStatusPill tone="neutral">Read only</EditorStatusPill> : null}
                  </div>
                  <p className="theme-text-faint truncate text-xs">
                    {playlist.replication_slugs.length} {playlist.replication_slugs.length === 1 ? "work" : "works"}
                    {" · updated "}
                    {playlist.updated_at.slice(0, 10)}
                    {isAdmin ? ` · ${playlist.owner_email ?? "unowned"}` : ""}
                  </p>
                </div>
                {playlist.editable ? (
                  <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy || isDirty}
                      onClick={() => setDraft(draftOf(playlist))}
                    >
                      <Icon icon="lucide:pencil" size={14} />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghostDestructive"
                      size="icon"
                      className="h-8 w-8"
                      disabled={busy}
                      aria-label={`Delete ${playlist.title}`}
                      onClick={() => setDeleteTarget(playlist)}
                    >
                      <Icon icon="lucide:trash-2" size={14} />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </EditorSection>

      {draft ? (
        <EditorSection icon="lucide:pencil-line" title={draft.expectedUpdatedAt === null ? "New playlist" : "Editor"}>
          <PlaylistEditor
            draft={draft}
            isNew={draft.expectedUpdatedAt === null}
            isDirty={isDirty}
            busy={busy}
            showOwner={isAdmin}
            onChange={setDraft}
            onSave={save}
            onCancel={() => setDraft(null)}
            onAssignOwner={assignOwner}
          />
        </EditorSection>
      ) : null}

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
              This permanently deletes the saved playlist. Galleries it was applied to are unchanged, because applying is a one-time copy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (deleteTarget) remove(deleteTarget);
              }}
            >
              Delete playlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
