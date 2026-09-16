"use client";

/**
 * Playlists: `/dev/playlists`. A member's own replication playlists: the
 * ordered sets of works the replication studio applies to substance galleries.
 * A contributor sees and edits the playlists they own; an editor sees every
 * playlist but edits only their own; an admin edits all of them and may hand
 * one to a member. Ownership is enforced in Postgres; this tab only hides what
 * the route already refuses.
 *
 * Nothing here publishes. A playlist reaches the public site only when an
 * admin applies it to a gallery in the studio.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  LoadErrorState,
  useConfirm,
  useDirtyGuard,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";

import { PlaylistEditor } from "./PlaylistEditor";
import { PlaylistOwnership } from "./PlaylistOwnership";
import {
  EMPTY_DRAFT,
  assignPlaylistOwner,
  deletePlaylist,
  draftOf,
  fetchPlaylists,
  fetchPlaylist,
  isDraftDirty,
  savePlaylist,
  type OwnedPlaylist,
  type OwnedPlaylistSummary,
  type PlaylistDraft,
} from "./playlistsModel";

export type PlaylistsTabProps = {
  /** Admin: sees every playlist's owner and may reassign it. */
  isAdmin: boolean;
  /** `/dev/playlists/<key>`: the playlist the editor opens on, if the member may edit it. */
  initialKey?: string;
};

export function PlaylistsTab({ isAdmin, initialKey }: PlaylistsTabProps) {
  const [playlists, setPlaylists] = useState<OwnedPlaylistSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [draft, setDraft] = useState<PlaylistDraft | null>(null);
  const [saved, setSaved] = useState<OwnedPlaylist | null>(null);
  const [busy, setBusy] = useState(false);
  const keyedRequest = useRef(0);
  const { confirm, dialog: confirmDialog } = useConfirm();

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

  const openPlaylist = useCallback(async (target: Pick<OwnedPlaylistSummary, "key" | "editable">) => {
    if (!target.editable) return;
    const request = ++keyedRequest.current;
    setBusy(true);
    setNotice(null);
    try {
      const playlist = await fetchPlaylist(target.key);
      if (request !== keyedRequest.current || !playlist.editable) return;
      setSaved(playlist);
      setDraft(draftOf(playlist));
    } catch (error) {
      if (request !== keyedRequest.current) return;
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "Unable to load that playlist.",
      });
    } finally {
      if (request === keyedRequest.current) setBusy(false);
    }
  }, []);

  // A deep link starts its keyed read independently of the compact list.
  useEffect(() => {
    if (!initialKey) return;
    let cancelled = false;
    const request = ++keyedRequest.current;
    void fetchPlaylist(initialKey)
      .then((playlist) => {
        if (cancelled || request !== keyedRequest.current || !playlist.editable) return;
        setSaved(playlist);
        setDraft(draftOf(playlist));
      })
      .catch((error) => {
        if (cancelled || request !== keyedRequest.current) return;
        setNotice({
          tone: "danger",
          message: error instanceof Error ? error.message : "Unable to load that playlist.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [initialKey]);

  const isDirty = draft ? isDraftDirty(draft, saved) : false;
  const { guard, dialog: dirtyDialog } = useDirtyGuard(isDirty, {
    description: "This playlist has changes that are not saved. Discarding drops them; the stored playlist is unchanged.",
  });

  // The address follows the open playlist so a reload or a shared link lands
  // on it; a new, unsaved draft has no key to name.
  const openKey = saved?.key ?? null;
  const urlKeyRef = useRef(initialKey ?? null);
  useEffect(() => {
    if (openKey === urlKeyRef.current) return;
    urlKeyRef.current = openKey;
    window.history.replaceState(null, "", viewToPath({ type: "dev", tab: "playlists", slug: openKey ?? undefined }));
  }, [openKey]);

  /** Runs one write and reports the completed write separately from refresh failures. */
  const run = useCallback(
    async (action: () => Promise<string>, refresh = true) => {
      setBusy(true);
      setNotice(null);
      try {
        const success = await action();
        setNotice({ tone: "success", message: success });
        if (refresh) {
          try {
            await load();
          } catch {
            setNotice({ tone: "warning", message: `${success} Refresh failed; use Refresh to try again.` });
          }
        }
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
    confirm({
      title: `${creating ? "Create" : "Update"} "${draft.title}"?`,
      confirmLabel: "Confirm playlist publication",
      description: <div className="space-y-3">
        <p>This saves the reusable playlist. Showcases that previously copied it are unchanged; no canonical media record is edited.</p>
        <div><strong>Before</strong><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify({ title: saved?.title ?? "", works: saved?.replication_slugs ?? [] }, null, 2)}</pre></div>
        <div><strong>After</strong><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify({ title: draft.title, works: draft.slugs }, null, 2)}</pre></div>
      </div>,
      onConfirm: () => run(async () => {
        const stored = await savePlaylist(draft, { sendOwner: isAdmin && creating });
        setSaved(stored);
        setDraft(draftOf(stored));
        setPlaylists((current) => {
          const summary: OwnedPlaylistSummary = {
            key: stored.key,
            title: stored.title,
            work_count: stored.replication_slugs.length,
            updated_at: stored.updated_at,
            updated_by: stored.updated_by,
            owner_email: stored.owner_email,
            editable: stored.editable,
          };
          if (!current) return [summary];
          return [...current.filter((entry) => entry.key !== stored.key), summary]
            .sort((left, right) => left.title.localeCompare(right.title));
        });
        const dropped = stored.pruned.length > 0
          ? ` ${stored.pruned.length} ineligible entries were dropped.`
          : "";
        return `${creating ? "Created" : "Saved"} "${stored.title}".${dropped}`;
      }, false),
    });
  };

  const assignOwner = (target: Pick<OwnedPlaylist, "key" | "title" | "owner_email">, ownerEmail: string | null) => {
    confirm(
      ownerEmail
        ? {
            title: `Hand "${target.title}" to ${ownerEmail}?`,
            description:
              "They can edit and remove it from their own Playlists tab. This takes effect at once and leaves any unsaved draft alone.",
            confirmLabel: `Assign to ${ownerEmail}`,
            onConfirm: () =>
              run(async () => {
                const result = await assignPlaylistOwner(target.key, ownerEmail);
                setPlaylists((current) => current?.map((entry) =>
                  entry.key === target.key
                    ? { ...entry, owner_email: result.owner_email, updated_at: result.updated_at, updated_by: result.updated_by, editable: true }
                    : entry
                ) ?? current);
                setSaved((current) => current?.key === target.key
                  ? { ...current, owner_email: result.owner_email, updated_at: result.updated_at, updated_by: result.updated_by, editable: true }
                  : current);
                return `"${target.title}" now belongs to ${ownerEmail}.`;
              }, false),
          }
        : {
            title: `Make "${target.title}" unowned?`,
            description:
              `${target.owner_email ?? "Its owner"} loses access to it; only admins can edit it until someone is assigned. This takes effect at once.`,
            confirmLabel: "Make unowned",
            destructive: true,
            onConfirm: () =>
              run(async () => {
                const result = await assignPlaylistOwner(target.key, null);
                setPlaylists((current) => current?.map((entry) =>
                  entry.key === target.key
                    ? { ...entry, owner_email: null, updated_at: result.updated_at, updated_by: result.updated_by, editable: true }
                    : entry
                ) ?? current);
                setSaved((current) => current?.key === target.key
                  ? { ...current, owner_email: null, updated_at: result.updated_at, updated_by: result.updated_by, editable: true }
                  : current);
                return `"${target.title}" is unowned and admin-only again.`;
              }, false),
          },
    );
  };

  const remove = (target: OwnedPlaylistSummary) => {
    confirm({
      title: `Remove ${target.title}?`,
      description:
        "It disappears from your lists and the pickers, but stays on the server; an admin can bring it back. Galleries it was applied to are unchanged, because applying is a one-time copy.",
      confirmLabel: "Remove playlist",
      destructive: true,
      onConfirm: () =>
        run(async () => {
          await deletePlaylist(target.key);
          setDraft((current) => (current?.key === target.key ? null : current));
          setSaved((current) => (current?.key === target.key ? null : current));
          setPlaylists((current) => current?.filter((entry) => entry.key !== target.key) ?? current);
          return `Removed "${target.title}".`;
        }, false),
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
              onClick={() => guard(() => {
                keyedRequest.current += 1;
                setSaved(null);
                setDraft({ ...EMPTY_DRAFT });
              })}
            >
              <Icon icon="lucide:plus" size={14} />
              New playlist
            </Button>
          </>
        }
      >
        {notice && !draft ? <EditorNotice notice={notice} /> : null}

        {loadError ? (
          <LoadErrorState message={loadError} onRetry={() => void load()} busy={busy} />
        ) : playlists === null ? (
          <StateCard loading compact title="Loading playlists" />
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
                    {playlist.work_count} {playlist.work_count === 1 ? "work" : "works"}
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
                      disabled={busy || draft?.key === playlist.key}
                      onClick={() => guard(() => void openPlaylist(playlist))}
                    >
                      <Icon icon="lucide:pencil" size={14} />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghostDestructive"
                      size="icon"
                      className={`h-8 w-8 ${TOUCH_ICON}`}
                      disabled={busy}
                      aria-label={`Remove ${playlist.title}`}
                      onClick={() => remove(playlist)}
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
            key={draft.expectedUpdatedAt === null ? "new" : draft.key}
            draft={draft}
            isNew={draft.expectedUpdatedAt === null}
            isDirty={isDirty}
            busy={busy}
            showOwner={isAdmin && draft.expectedUpdatedAt === null}
            notice={notice}
            saveLabel="Review playlist changes"
            onChange={setDraft}
            onSave={save}
            onCancel={() => guard(() => {
              keyedRequest.current += 1;
              setSaved(null);
              setDraft(null);
            })}
          />
        </EditorSection>
      ) : null}

      {isAdmin && saved ? (
        <PlaylistOwnership
          key={`${saved.key}:${saved.owner_email ?? ""}`}
          playlist={saved}
          busy={busy}
          onAssign={(ownerEmail) => assignOwner(saved, ownerEmail)}
        />
      ) : null}

      {confirmDialog}
      {dirtyDialog}
    </div>
  );
}
