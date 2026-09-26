"use client";

/**
 * Playlists: `/dev/playlists`. A member's own replication playlists: the
 * ordered sets of works the replication studio applies to substance galleries.
 * A contributor sees and edits the playlists they own; an editor sees every
 * playlist, edits their own and reads the rest; an admin edits all of them and
 * may hand one to a member. Ownership is enforced in Postgres; this tab only
 * hides what the route already refuses.
 *
 * Nothing here publishes. A playlist reaches the public site only when an
 * admin applies it to a gallery in the studio, so the tool says that beside
 * Save (`saveLine: "in-tool"`) instead of the shell's "goes live" sentence.
 *
 * Layout is the editor workspace: the list on the left (sticky on desktop),
 * the open playlist in a docked pane on the right with its save dock at the
 * bottom, so the result of a save shows beside Save. On a phone the pane
 * stacks under the list, opening scrolls it in, and the pane carries Back to
 * list. Works are chosen visually, the confirm reads the change back in
 * words, and an entry the lookup cannot find is flagged before Save and named
 * after it, so a save never drops anything silently.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorPanel,
  EditorSection,
  LoadErrorState,
  Notice,
  SaveLine,
  useConfirm,
  useDevShortcuts,
  useDirtyGuard,
  useScrollToDetail,
  useUnsavedWork,
  type NoticeMessage,
  type SearchablePickerOption,
} from "@/features/dev/components";
import { useWriteFreeze } from "@/features/dev/components/writeFreeze";
import { fetchRoster } from "@/features/dev/tools/members/membersModel";
import { cn } from "@/lib/utils";
import { viewToPath } from "@/utils/routing";

import { useModifierKeyLabel } from "../../pages/DevCommandPalette";
import { LINK_LIST_CLASS, RelativeDay, RowSkeletons, SectionNote } from "../home/homeParts";
import { countNoun } from "../home/homeModel";
import { PLAYLIST_SAVE_COPY, PlaylistPane, type PaneMode } from "./PlaylistPane";
import {
  EMPTY_DRAFT,
  PlaylistConflictError,
  assignPlaylistOwner,
  changedPlaylistParts,
  deletePlaylist,
  draftOf,
  fetchPlaylist,
  fetchPlaylists,
  isDraftDirty,
  isWriteFreezeRefusal,
  playlistKeyOf,
  savePlaylist,
  sortPlaylists,
  summarizePlaylistChange,
  summaryOf,
  type OwnedPlaylist,
  type OwnedPlaylistSummary,
  type PlaylistDraft,
} from "./playlistsModel";
import { useWorkCards } from "./useWorkCards";

export type PlaylistsTabProps = {
  /** Admin: sees every playlist's owner and may reassign it. */
  isAdmin: boolean;
  /** `/dev/playlists/<key>`: the playlist the tool opens on. */
  initialKey?: string;
};

type OpenPlaylist = { mode: PaneMode; saved: OwnedPlaylist | null; draft: PlaylistDraft };

/** Lists longer than this get a filter field. */
const FILTER_FROM = 8;

const PANE_SHORTCUTS = [
  { keys: "Cmd+S", label: "Save the open playlist" },
  { keys: "/", label: "Search works to add" },
] as const;
const LIST_SHORTCUTS = [{ keys: "/", label: "Filter playlists" }] as const;

const FREEZE_SAVE = "Writes are paused, so your changes were not saved. They are still here; save again once writes resume.";

export function PlaylistsTab({ isAdmin, initialKey }: PlaylistsTabProps) {
  const [rows, setRows] = useState<OwnedPlaylistSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<OpenPlaylist | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  /** Where the tap happened: the result of opening, removing, or a write with no pane open. */
  const [listNotice, setListNotice] = useState<NoticeMessage | null>(null);
  /** The result of the last write on the open playlist, in its save dock. */
  const [paneNotice, setPaneNotice] = useState<NoticeMessage | null>(null);
  const [writing, setWriting] = useState<null | "save" | "other">(null);
  const [filter, setFilter] = useState("");
  const keyedRequest = useRef(0);
  const listRef = useRef<HTMLElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const paneTitleRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const focusPaneOnOpen = useRef(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const freeze = useWriteFreeze();
  const saveKeyLabel = useModifierKeyLabel("S");
  const workCards = useWorkCards(open?.draft.slugs ?? [], open !== null);
  const roster = useMemberOptions(isAdmin);
  const busy = writing !== null;

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setRows(await fetchPlaylists());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load playlists.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const show = useCallback((playlist: OwnedPlaylist) => {
    focusPaneOnOpen.current = true;
    setOpen({ mode: playlist.editable ? "edit" : "view", saved: playlist, draft: draftOf(playlist) });
  }, []);

  const openPlaylist = useCallback(async (target: Pick<OwnedPlaylistSummary, "key" | "title">) => {
    const request = ++keyedRequest.current;
    setOpeningKey(target.key);
    setListNotice(null);
    setPaneNotice(null);
    try {
      const playlist = await fetchPlaylist(target.key);
      if (request !== keyedRequest.current) return;
      show(playlist);
    } catch (error) {
      if (request !== keyedRequest.current) return;
      const message = error instanceof Error ? error.message : "Unable to load that playlist.";
      setListNotice({
        tone: "danger",
        title: `Could not open "${target.title}".`,
        message,
        actions: (
          <Button type="button" variant="outline" size="sm" onClick={() => void openPlaylist(target)}>
            Try again
          </Button>
        ),
      });
    } finally {
      if (request === keyedRequest.current) setOpeningKey(null);
    }
  }, [show]);

  // The key currently in the address, so the address change an open makes is not read as a new deep link.
  const urlKeyRef = useRef<string | null>(initialKey ?? null);
  /** A deep link waits for its keyed read before the address may change, or the address would wipe it. */
  const deepLinkPending = useRef(Boolean(initialKey));

  /** The address follows the open playlist so a reload or a shared link lands on it; a new draft has no key to name. */
  const syncAddress = useCallback((key: string | null) => {
    if (key === urlKeyRef.current) return;
    urlKeyRef.current = key;
    // Hand Next its own history state back, or the router treats the change as a navigation and scrolls to the top.
    window.history.replaceState(window.history.state, "", viewToPath({ type: "dev", tab: "playlists", slug: key ?? undefined }));
  }, []);

  // A deep link starts its keyed read independently of the compact list. It
  // is never cancelled by the address changing under it: a later request wins.
  useEffect(() => {
    if (!initialKey) return;
    if (initialKey === urlKeyRef.current && !deepLinkPending.current) return;
    urlKeyRef.current = initialKey;
    deepLinkPending.current = true;
    const request = ++keyedRequest.current;
    setOpeningKey(initialKey);
    void fetchPlaylist(initialKey)
      .then((playlist) => {
        if (request !== keyedRequest.current) return;
        deepLinkPending.current = false;
        show(playlist);
        if (!playlist.editable) {
          setListNotice({ tone: "info", message: `"${playlist.title}" opened read only: only its owner or an admin can change it.` });
        }
      })
      .catch((error: unknown) => {
        if (request !== keyedRequest.current) return;
        deepLinkPending.current = false;
        const message = error instanceof Error ? error.message : "Unable to load that playlist.";
        setListNotice({
          tone: "warning",
          title: `Could not open the playlist "${initialKey}".`,
          message: /no playlist/i.test(message) ? "No playlist you can see has that key. It may have been removed, or the address may be mistyped." : message,
        });
        // A failed deep link drops its key from the address.
        syncAddress(null);
      })
      .finally(() => {
        if (request === keyedRequest.current) setOpeningKey(null);
      });
  }, [initialKey, show, syncAddress]);

  const openKey = open?.saved?.key ?? null;
  useEffect(() => {
    if (deepLinkPending.current) return;
    syncAddress(openKey);
  }, [openKey, syncAddress]);

  const isDirty = open !== null && open.mode !== "view" && isDraftDirty(open.draft, open.saved);
  // The guard keeps in-tool switches (another playlist, New, Close); the shell
  // owns rail clicks, Leave and unload. Saving reads the change back in a
  // confirm first, so the shell only discards.
  const { guard, dialog: dirtyDialog } = useDirtyGuard(isDirty, {
    description: "This playlist has changes that are not saved. Discarding drops them; the stored playlist is unchanged.",
    warnOnUnload: false,
  });
  const discardDraft = () =>
    setOpen((current) => (current ? { ...current, draft: current.saved ? draftOf(current.saved) : { ...EMPTY_DRAFT } } : current));
  useUnsavedWork({
    id: "playlists",
    label: `Playlists: “${open?.draft.title.trim() || "Untitled"}”`,
    dirty: isDirty,
    discard: () => setOpen((current) => (current?.saved ? { ...current, draft: draftOf(current.saved) } : null)),
  });

  // Name the playlist for keyboard and screen reader users once its pane is in
  // the page; on phones the pane scrolls itself in. An effect, not a frame
  // later, so a click that lands in a field right after keeps its focus.
  const paneIdentity = open ? `${open.mode}:${open.saved?.key ?? "new"}` : null;
  useScrollToDetail(paneRef, paneIdentity);
  useEffect(() => {
    if (paneIdentity === null || !focusPaneOnOpen.current) return;
    focusPaneOnOpen.current = false;
    paneTitleRef.current?.focus({ preventScroll: true });
  }, [paneIdentity]);

  /** A failed write in the tool's words: the freeze reads as the freeze. */
  const failure = (error: unknown, fallback: string, frozenCopy: string): NoticeMessage => {
    const message = error instanceof Error ? error.message : fallback;
    if (isWriteFreezeRefusal(message) || freeze.frozen) return { tone: "danger", message: frozenCopy };
    return { tone: "danger", message };
  };

  const askLoadLatest = (key: string) => {
    confirm({
      title: "Load the latest version?",
      description: "Your edits here are dropped and the editor shows the playlist as it is stored now. Note anything you want to keep first.",
      confirmLabel: "Load latest",
      destructive: true,
      onConfirm: async () => {
        const playlist = await fetchPlaylist(key);
        setOpen({ mode: playlist.editable ? "edit" : "view", saved: playlist, draft: draftOf(playlist) });
        setRows((current) => current?.map((row) => (row.key === key ? summaryOf(playlist) : row)) ?? current);
        setPaneNotice({ tone: "info", message: "Loaded the latest version. Apply your edits again, then save." });
      },
    });
  };

  const save = async (draft: PlaylistDraft, creating: boolean) => {
    setWriting("save");
    setPaneNotice(null);
    try {
      const stored = await savePlaylist(draft, { sendOwner: isAdmin && creating });
      const playlist: OwnedPlaylist = { ...stored, editable: stored.editable ?? true };
      setOpen({ mode: "edit", saved: playlist, draft: draftOf(playlist) });
      setRows((current) => sortPlaylists([...(current ?? []).filter((row) => row.key !== playlist.key), summaryOf(playlist)]));
      const done = `${creating ? "Created" : "Saved"} "${playlist.title}".`;
      const pruned = stored.pruned ?? [];
      if (pruned.length > 0) {
        setPaneNotice({
          tone: "warning",
          message: `${done} Left out ${pruned.length} ${pruned.length === 1 ? "entry that is" : "entries that are"} not a published work a playlist can hold: ${pruned.join(", ")}.`,
        });
      } else {
        setPaneNotice({ tone: "success", message: done });
      }
    } catch (error) {
      if (error instanceof PlaylistConflictError && !creating) {
        setPaneNotice({
          tone: "danger",
          title: "Someone saved this playlist after you opened it.",
          message: "Your edits are still here. Note what you changed, then load the latest version and apply them again.",
          actions: (
            <Button type="button" variant="outline" size="sm" onClick={() => askLoadLatest(draft.key)}>
              Load the latest version
            </Button>
          ),
        });
      } else if (error instanceof PlaylistConflictError) {
        setPaneNotice({
          tone: "danger",
          title: `A playlist with the key "${draft.key}" already exists.`,
          message: "Change the name so the new playlist gets its own key, then create it.",
        });
      } else {
        setPaneNotice(failure(error, "The save did not go through.", FREEZE_SAVE));
      }
    } finally {
      setWriting(null);
    }
  };

  const confirmSave = () => {
    if (!open || open.mode === "view" || busy) return;
    const { draft, saved } = open;
    const creating = open.mode === "new";
    const summary = summarizePlaylistChange({
      before: saved ? { title: saved.title, slugs: saved.replication_slugs } : null,
      after: { title: draft.title, slugs: draft.slugs },
      labelOf: (slug) => workCards.get(slug)?.title || slug,
      unavailable: workCards.unavailable,
    });
    const parts = changedPlaylistParts(draft, saved);
    confirm({
      title: `${creating ? "Create" : "Save"} "${draft.title.trim()}"?`,
      confirmLabel: creating ? "Create playlist" : "Save playlist",
      // A string description (the dialog wraps it in a <p>); the list goes in the body.
      description: `${parts.length > 0 ? `You changed ${joinWords(parts)}. ` : ""}This saves the playlist only. It publishes nothing, and galleries that already copied it stay as they are.`,
      body: (
        <div className="theme-text-secondary space-y-3 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            {summary.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
          {summary.leftOut.length > 0 ? (
            <p>
              Left out because they are not published works a playlist can hold: {summary.leftOut.join(", ")}.
            </p>
          ) : null}
        </div>
      ),
      onConfirm: () => save(draft, creating),
    });
  };

  // Cmd+S or Ctrl+S asks to save the open playlist; it never saves past the
  // confirm. `/` focuses the work search in the pane, or the list filter.
  const paneEditable = open !== null && open.mode !== "view";
  useDevShortcuts(paneEditable ? PANE_SHORTCUTS : LIST_SHORTCUTS, rows !== null);
  const confirmSaveRef = useRef(confirmSave);
  confirmSaveRef.current = confirmSave;
  const canSave = paneEditable && isDirty && !busy;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const dialogOpen = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
        if (!paneEditable) return;
        event.preventDefault();
        if (canSave && !dialogOpen) confirmSaveRef.current();
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || dialogOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const field = (paneEditable ? searchRef.current : null) ?? filterRef.current;
      if (!field) return;
      event.preventDefault();
      field.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paneEditable, canSave]);

  const focusRow = (key: string | undefined) => {
    if (!key) return;
    listRef.current?.querySelector<HTMLElement>(`[data-playlist="${CSS.escape(key)}"] button`)?.focus({ preventScroll: true });
  };

  const startNew = (seed?: Partial<PlaylistDraft>) => {
    if (open?.mode === "new" && !seed) {
      // One new draft at a time: New takes you back to it.
      paneTitleRef.current?.focus();
      paneRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      return;
    }
    guard(() => {
      keyedRequest.current += 1;
      setOpeningKey(null);
      setPaneNotice(null);
      setListNotice(null);
      focusPaneOnOpen.current = true;
      setOpen({ mode: "new", saved: null, draft: { ...EMPTY_DRAFT, ...seed } });
    });
  };

  const copyIntoNew = () => {
    if (!open) return;
    const title = `${open.saved?.title ?? open.draft.title} (copy)`;
    startNew({ title, key: playlistKeyOf(title), slugs: [...open.draft.slugs] });
  };

  const closePane = () =>
    guard(() => {
      const key = open?.saved?.key;
      keyedRequest.current += 1;
      setOpen(null);
      setPaneNotice(null);
      requestAnimationFrame(() => focusRow(key));
    });

  const backToList = () => {
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    focusRow(open?.saved?.key);
  };

  const assignOwner = (target: OwnedPlaylist, ownerEmail: string | null) => {
    const name = ownerEmail ? roster.nameOf(ownerEmail) : null;
    const apply = async () => {
      setWriting("other");
      setPaneNotice(null);
      try {
        const result = await assignPlaylistOwner(target.key, ownerEmail);
        const patch = { owner_email: result.owner_email, updated_at: result.updated_at, updated_by: result.updated_by, editable: true };
        setRows((current) => current?.map((row) => (row.key === target.key ? { ...row, ...patch } : row)) ?? current);
        // The owner is not part of the draft; only the stored playlist moves (and the revision the draft saves against).
        setOpen((current) => current?.saved?.key === target.key
          ? { ...current, saved: { ...current.saved, ...patch }, draft: { ...current.draft, expectedUpdatedAt: result.updated_at } }
          : current);
        setPaneNotice({
          tone: "success",
          message: ownerEmail ? `"${target.title}" now belongs to ${name}.` : `"${target.title}" is unowned and admin-only again.`,
        });
      } catch (error) {
        setPaneNotice(failure(error, "The owner did not change.", "Writes are paused, so the owner did not change. Try again once writes resume."));
      } finally {
        setWriting(null);
      }
    };
    confirm(
      ownerEmail
        ? {
            title: `Hand "${target.title}" to ${name}?`,
            description: `${name === ownerEmail ? ownerEmail : `${name} (${ownerEmail})`} can edit and remove it from their own Playlists. This takes effect at once and leaves any unsaved edits here alone.`,
            confirmLabel: "Assign owner",
            onConfirm: apply,
          }
        : {
            title: `Make "${target.title}" unowned?`,
            description: `${target.owner_email ? roster.nameOf(target.owner_email) : "Its owner"} loses access to it; only admins can edit it until someone is assigned. This takes effect at once.`,
            confirmLabel: "Make unowned",
            destructive: true,
            onConfirm: apply,
          },
    );
  };

  const remove = (target: OwnedPlaylist) => {
    confirm({
      title: `Remove "${target.title}"?`,
      description: `It disappears from every list and picker, and there is no restore button: bringing it back takes a database change. Galleries it was applied to are unchanged, because applying is a one-time copy.${isDirty ? " Your unsaved edits to it are dropped too." : ""}`,
      confirmLabel: "Remove playlist",
      destructive: true,
      onConfirm: async () => {
        setWriting("other");
        setPaneNotice(null);
        try {
          await deletePlaylist(target.key);
          keyedRequest.current += 1;
          setOpen((current) => (current?.saved?.key === target.key ? null : current));
          setRows((current) => current?.filter((row) => row.key !== target.key) ?? current);
          setListNotice({ tone: "success", message: `Removed "${target.title}".` });
          requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("[data-playlist] button")?.focus({ preventScroll: true }));
        } catch (error) {
          setPaneNotice(failure(error, "The playlist was not removed.", "Writes are paused, so the playlist was not removed."));
        } finally {
          setWriting(null);
        }
      },
    });
  };

  const words = filter.trim().toLowerCase();
  const visibleRows = rows?.filter((row) => !words || `${row.title} ${row.key}`.toLowerCase().includes(words)) ?? [];
  const hasRows = rows !== null && rows.length > 0;
  const showWorkspace = hasRows || open !== null;
  const editableCount = rows?.filter((row) => row.editable).length ?? 0;
  const readOnlyCount = (rows?.length ?? 0) - editableCount;
  const description = isAdmin
    ? "Every replication playlist and who owns it. Open one to set its works and order; applying it to a gallery happens in Replication Studio."
    : readOnlyCount > 0
      ? "Replication playlists: ordered sets of works an admin can apply to a substance gallery. You edit your own and can read everyone else's."
      : "Your replication playlists: ordered sets of works an admin can apply to a substance gallery.";

  return (
    <div className="space-y-10">
      <EditorSection
        icon="lucide:list-music"
        title="Playlists"
        description={description}
        actions={
          <Button type="button" variant="accent" size="sm" disabled={busy} onClick={() => startNew()}>
            <Icon icon="lucide:plus" size={14} />
            New playlist
          </Button>
        }
      >
        {loadError ? (
          <LoadErrorState what="playlists" message={loadError} onRetry={() => void load()} busy={loading} />
        ) : rows === null ? (
          <RowSkeletons rows={4} label="playlists" />
        ) : rows.length === 0 && !open ? (
          <div className="max-w-3xl space-y-3">
            {listNotice ? <Notice {...listNotice} dismiss={() => setListNotice(null)} /> : null}
            <SectionNote icon="lucide:list-music">
              <span className="theme-text-secondary block font-medium">No playlists yet</span>
              <span className="block">Name one, then add works by searching for them. Saving publishes nothing.</span>
            </SectionNote>
            <Button type="button" variant="outline" size="sm" onClick={() => startNew()}>
              <Icon icon="lucide:plus" size={14} />
              Start a playlist
            </Button>
          </div>
        ) : null}

        {showWorkspace && !loadError ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
            <section ref={listRef} aria-labelledby="playlists-list-heading" className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
              <div className="flex items-center justify-between gap-3">
                <h3 id="playlists-list-heading" className="type-meta-label theme-text-muted">
                  {isAdmin ? "All playlists" : readOnlyCount > 0 ? "Playlists" : "Your playlists"}
                </h3>
                <div className="flex items-center gap-1">
                  <p className="theme-text-muted text-xs tabular-nums">{countNoun(rows?.length ?? 0, "playlist")}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                    onClick={() => void load()}
                    disabled={loading || busy}
                    aria-busy={loading || undefined}
                    aria-label={loading ? "Refreshing playlists" : "Refresh playlists"}
                    title="Refresh"
                  >
                    <Icon icon="lucide:refresh-cw" size={14} className={cn(loading && "motion-safe:animate-spin")} />
                  </Button>
                </div>
              </div>
              {listNotice ? <Notice {...listNotice} dismiss={() => setListNotice(null)} /> : null}
              {(rows?.length ?? 0) > FILTER_FROM ? (
                <div className="relative">
                  <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    ref={filterRef}
                    type="search"
                    aria-label="Filter playlists"
                    aria-keyshortcuts="/"
                    value={filter}
                    placeholder="Filter by name"
                    className="pl-9 text-[16px] md:text-sm"
                    onChange={(event) => setFilter(event.target.value)}
                  />
                </div>
              ) : null}
              <ul aria-label="Playlists" className={cn(LINK_LIST_CLASS, "lg:max-h-[min(calc(100dvh-13rem),720px)] lg:overflow-y-auto")}>
                {open?.mode === "new" ? (
                  <li data-playlist="__new__">
                    <button
                      type="button"
                      aria-current="true"
                      onClick={() => paneTitleRef.current?.focus()}
                      className="theme-dev-link-row theme-dev-link-lead flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2.5 text-left text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="theme-text-primary line-clamp-2 break-words font-medium">{open.draft.title.trim() || "New playlist"}</span>
                        <span className="theme-text-faint mt-0.5 block text-xs">
                          <span className="sr-only">, </span>
                          {countNoun(open.draft.slugs.length, "work")} · Not saved yet
                        </span>
                      </span>
                      <RowState editing dirty={isDirty} />
                    </button>
                  </li>
                ) : null}
                {visibleRows.map((row) => {
                  const isOpen = open?.saved?.key === row.key;
                  return (
                    <li key={row.key} data-playlist={row.key}>
                      <PlaylistRow
                        row={row}
                        isAdmin={isAdmin}
                        ownerName={roster.nameOf}
                        isOpen={isOpen}
                        dirty={isOpen && isDirty}
                        opening={openingKey === row.key}
                        disabled={openingKey !== null || busy}
                        onOpen={() => (isOpen ? paneTitleRef.current?.focus() : guard(() => void openPlaylist(row)))}
                      />
                    </li>
                  );
                })}
              </ul>
              {words && visibleRows.length === 0 ? (
                <p className="theme-text-muted text-sm">
                  No playlist matches &ldquo;{filter.trim()}&rdquo;.{" "}
                  <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setFilter("")}>
                    Show every playlist
                  </Button>
                </p>
              ) : null}
            </section>

            <section
              ref={paneRef}
              aria-label={open ? `${open.mode === "view" ? "Playlist" : "Editor"}: ${open.saved?.title ?? "New playlist"}` : "Editor"}
              className={cn("scroll-mt-24", !open && "hidden lg:block")}
            >
              {open ? (
                <PlaylistPane
                  key={open.saved?.key ?? "new"}
                  mode={open.mode}
                  draft={open.draft}
                  saved={open.saved}
                  dirty={isDirty}
                  saving={writing === "save"}
                  busy={busy}
                  isAdmin={isAdmin}
                  notice={paneNotice}
                  onDismissNotice={() => setPaneNotice(null)}
                  onChange={(draft) => setOpen((current) => (current ? { ...current, draft } : current))}
                  onSave={confirmSave}
                  onDiscard={discardDraft}
                  onClose={closePane}
                  onBackToList={backToList}
                  onRemove={() => open.saved && remove(open.saved)}
                  onCopy={copyIntoNew}
                  onAssign={(ownerEmail) => open.saved && assignOwner(open.saved, ownerEmail)}
                  titleRef={paneTitleRef}
                  searchRef={searchRef}
                  workCards={workCards}
                  memberOptions={roster.options}
                  rosterError={roster.error}
                  onRetryRoster={roster.retry}
                  ownerName={roster.nameOf}
                  saveKeyLabel={saveKeyLabel}
                />
              ) : (
                <IdlePane opening={openingKey !== null} />
              )}
            </section>
          </div>
        ) : null}
      </EditorSection>

      {confirmDialog}
      {dirtyDialog}
    </div>
  );
}

function joinWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** What the pane says on desktop before a playlist is open. Hidden on phones, where the list is the whole view. */
function IdlePane({ opening }: { opening: boolean }) {
  return (
    <EditorPanel variant="subtle" className="space-y-3 px-5 py-6" aria-busy={opening || undefined}>
      <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
        <Icon
          icon={opening ? "lucide:loader-circle" : "lucide:list-music"}
          size={18}
          className={cn("theme-icon-accent shrink-0", opening && "motion-safe:animate-spin")}
        />
        {opening ? "Opening the playlist" : "Pick a playlist, or start a new one"}
      </p>
      <p className="theme-text-muted max-w-[60ch] text-sm">
        Its name, works and order open here. You add works by searching for them, set the order by dragging, and confirm
        each save.
      </p>
      <SaveLine model="instant" copy={PLAYLIST_SAVE_COPY} />
    </EditorPanel>
  );
}

function PlaylistRow({
  row,
  isAdmin,
  ownerName,
  isOpen,
  dirty,
  opening,
  disabled,
  onOpen,
}: {
  row: OwnedPlaylistSummary;
  isAdmin: boolean;
  ownerName: (email: string) => string;
  isOpen: boolean;
  dirty: boolean;
  opening: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={isOpen ? "true" : undefined}
      aria-busy={opening || undefined}
      disabled={disabled && !isOpen}
      onClick={onOpen}
      className={cn(
        "theme-dev-link-row group flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2.5 text-left text-sm transition-colors disabled:cursor-wait motion-reduce:transition-none",
        isOpen && "theme-dev-link-lead",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="theme-text-primary line-clamp-2 break-words font-medium">{row.title}</span>
        <span className="theme-text-faint mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className="sr-only">, </span>
          <span className="tabular-nums">{countNoun(row.work_count, "work")}</span>
          <span aria-hidden>·</span>
          <RelativeDay iso={row.updated_at} prefix="Updated" />
        </span>
        {isAdmin || !row.editable ? (
          <span className="theme-text-faint mt-0.5 flex items-center gap-1 text-xs">
            <span className="sr-only">, </span>
            {!row.editable ? <Icon icon="lucide:lock" size={11} className="shrink-0" /> : null}
            <span className="truncate">
              {!row.editable
                ? "Read only"
                : row.owner_email
                  ? ownerName(row.owner_email)
                  : "Unowned, admins only"}
            </span>
          </span>
        ) : null}
      </span>
      {opening ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <Icon icon="lucide:loader-circle" size={14} className="motion-safe:animate-spin" />
          <span>Opening</span>
        </span>
      ) : isOpen ? (
        <RowState editing={row.editable} dirty={dirty} />
      ) : (
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <span className="sr-only">, </span>
          <span className="theme-text-muted [@media(pointer:fine)]:sr-only">{row.editable ? "Edit" : "View"}</span>
          <Icon icon="lucide:chevron-right" size={16} className="theme-dev-link-row-chevron" />
        </span>
      )}
    </button>
  );
}

function RowState({ editing, dirty }: { editing: boolean; dirty: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs">
      <span className="sr-only">, </span>
      {dirty ? <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" /> : null}
      <span className="text-dose-accent-strong font-medium">{editing ? (dirty ? "Editing, unsaved" : "Editing") : "Viewing"}</span>
    </span>
  );
}

/**
 * Admin only: the members a playlist can be handed to, for the owner pickers,
 * and each member's name for the sentences that mention them. Banned accounts
 * are left out. A failed read says so (with a retry) rather than letting the
 * picker claim no member matches.
 */
function useMemberOptions(isAdmin: boolean): {
  options: SearchablePickerOption[];
  error: string | null;
  retry: () => void;
  nameOf: (email: string) => string;
} {
  const [members, setMembers] = useState<SearchablePickerOption[]>([]);
  const [self, setSelf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchRoster()
      .then((roster) => {
        if (cancelled) return;
        setError(null);
        setSelf(roster.self);
        setMembers(
          roster.members
            .filter((member) => !member.bannedAt)
            .map((member) => ({ value: member.email, label: member.username ?? member.name ?? member.email, hint: member.email })),
        );
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setMembers([]);
        setError(failure instanceof Error ? failure.message : "Unable to load members.");
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, attempt]);
  const nameOf = useCallback(
    (email: string) => {
      const name = members.find((member) => member.value === email)?.label ?? email;
      return email === self ? `${name} (you)` : name;
    },
    [members, self],
  );
  return { options: members, error, retry: () => setAttempt((count) => count + 1), nameOf };
}
