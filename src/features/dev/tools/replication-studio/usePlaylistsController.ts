"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EditorActionStatusState } from "@/features/dev/components";
import {
  playlistKeyOf,
  type PlaylistDraft,
  type ReplicationPlaylist,
  type ReplicationPlaylistSummary,
} from "./replicationPlaylistModel";

const PLAYLISTS_API = "/api/dev/replications/playlists";

type Feedback = { tone: "success" | "warning" | "danger"; message: string };
type DraftTransition =
  | { kind: "close" }
  | { kind: "new" }
  | { kind: "open"; playlist: ReplicationPlaylistSummary };

function slugListsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((slug, index) => slug === right[index]);
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchReplicationPlaylist(key: string): Promise<ReplicationPlaylist> {
  const response = await fetch(`${PLAYLISTS_API}/${encodeURIComponent(key)}`);
  if (!response.ok) {
    throw new Error(await readError(response, "Could not load that playlist."));
  }
  const payload = (await response.json()) as { playlist?: ReplicationPlaylist };
  if (!payload.playlist) throw new Error("The playlist endpoint returned no playlist.");
  return payload.playlist;
}

export function usePlaylistsController({
  onDirtyChange,
}: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const [playlists, setPlaylists] = useState<ReplicationPlaylistSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState(0);
  const [draft, setDraft] = useState<PlaylistDraft | null>(null);
  const [savedPlaylist, setSavedPlaylist] = useState<ReplicationPlaylist | null>(null);
  const [pendingTransition, setPendingTransition] = useState<DraftTransition | null>(null);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(() => new Set());
  const [saveState, setSaveState] = useState<EditorActionStatusState | "idle">("idle");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const deletingKeysRef = useRef(new Set<string>());
  const savingRef = useRef(false);
  const keyedRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(PLAYLISTS_API);
        if (!response.ok) {
          if (!cancelled) setFeedback({ tone: "danger", message: await readError(response, "Could not load the playlists.") });
          return;
        }
        const payload = (await response.json()) as { playlists?: unknown };
        if (!Array.isArray(payload.playlists)) {
          if (!cancelled) setFeedback({ tone: "danger", message: "The playlists endpoint returned something unreadable." });
          return;
        }
        if (!cancelled) {
          setPlaylists(payload.playlists as ReplicationPlaylistSummary[]);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setFeedback({ tone: "danger", message: "Could not reach the playlists endpoint." });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const savedSlugs = savedPlaylist?.replication_slugs ?? [];
  const isDirty = useMemo(() => {
    if (!draft) return false;
    if (!savedPlaylist || draft.expectedUpdatedAt === null) {
      return draft.title.trim().length > 0 || draft.slugs.length > 0;
    }
    return draft.title !== savedPlaylist.title || !slugListsEqual(draft.slugs, savedPlaylist.replication_slugs);
  }, [draft, savedPlaylist]);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const applyTransition = useCallback((transition: Exclude<DraftTransition, { kind: "open" }>) => {
    if (savingRef.current) return;
    keyedRequestRef.current += 1;
    setSavedPlaylist(null);
    setDraft(transition.kind === "new" ? { key: "", title: "", slugs: [], expectedUpdatedAt: null } : null);
    setSaveState("idle");
  }, []);

  const openStoredPlaylist = useCallback(async (playlist: ReplicationPlaylistSummary) => {
    if (savingRef.current) return;
    const request = ++keyedRequestRef.current;
    setFeedback(null);
    try {
      const full = await fetchReplicationPlaylist(playlist.key);
      if (request !== keyedRequestRef.current || savingRef.current) return;
      setSavedPlaylist(full);
      setDraft({ key: full.key, title: full.title, slugs: [...full.replication_slugs], expectedUpdatedAt: full.updated_at });
      setSaveState("idle");
    } catch (error) {
      if (request !== keyedRequestRef.current) return;
      setFeedback({ tone: "danger", message: error instanceof Error ? error.message : "Could not load that playlist." });
    }
  }, []);

  const requestTransition = useCallback((transition: DraftTransition) => {
    if (savingRef.current) return;
    if (isDirty) {
      setPendingTransition(transition);
      return;
    }
    if (transition.kind === "open") void openStoredPlaylist(transition.playlist);
    else applyTransition(transition);
  }, [applyTransition, isDirty, openStoredPlaylist]);

  const openPlaylist = useCallback((playlist: ReplicationPlaylistSummary) => {
    if (draft?.key === playlist.key) return;
    requestTransition({ kind: "open", playlist });
  }, [draft?.key, requestTransition]);
  const startNewPlaylist = useCallback(() => requestTransition({ kind: "new" }), [requestTransition]);
  const closeDraft = useCallback(() => requestTransition({ kind: "close" }), [requestTransition]);
  const discardPendingTransition = useCallback(() => {
    if (savingRef.current || !pendingTransition) return;
    const transition = pendingTransition;
    setPendingTransition(null);
    if (transition.kind === "open") void openStoredPlaylist(transition.playlist);
    else applyTransition(transition);
  }, [applyTransition, openStoredPlaylist, pendingTransition]);

  const setDraftTitle = useCallback((title: string) => {
    if (savingRef.current) return;
    setDraft((current) => current ? { ...current, title, key: current.expectedUpdatedAt === null ? playlistKeyOf(title) : current.key } : current);
    setSaveState("idle");
  }, []);
  const setDraftSlugs = useCallback((slugs: string[]) => {
    if (savingRef.current) return;
    setDraft((current) => current ? { ...current, slugs } : current);
    setSaveState("idle");
  }, []);
  const resetDraft = useCallback(() => {
    if (savingRef.current) return;
    if (savedPlaylist) {
      setDraft({ key: savedPlaylist.key, title: savedPlaylist.title, slugs: [...savedPlaylist.replication_slugs], expectedUpdatedAt: savedPlaylist.updated_at });
    } else if (draft) {
      setDraft({ key: "", title: "", slugs: [], expectedUpdatedAt: null });
    }
    setSaveState("idle");
  }, [draft, savedPlaylist]);

  const save = useCallback(async () => {
    if (savingRef.current || !draft) return;
    if (draft.title.trim().length === 0 || draft.key.length === 0) {
      setFeedback({ tone: "warning", message: "A playlist needs a name before it can be saved." });
      return;
    }
    savingRef.current = true;
    keyedRequestRef.current += 1;
    setSaveState("saving");
    try {
      const response = await fetch(PLAYLISTS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: draft.key, title: draft.title, slugs: draft.slugs, expectedUpdatedAt: draft.expectedUpdatedAt }),
      });
      if (response.status === 409) {
        setSaveState("idle");
        setFeedback({ tone: "warning", message: `"${draft.title}" changed since you opened it. Reload the playlists to see the stored version before saving again.` });
        return;
      }
      if (!response.ok) {
        setSaveState("idle");
        setFeedback({ tone: "danger", message: await readError(response, `Could not save "${draft.title}".`) });
        return;
      }
      const payload = (await response.json()) as { playlist: ReplicationPlaylist & { pruned: string[] } };
      const stored = payload.playlist;
      setSavedPlaylist(stored);
      setPlaylists((current) => {
        const summary: ReplicationPlaylistSummary = { key: stored.key, title: stored.title, work_count: stored.replication_slugs.length, updated_at: stored.updated_at, updated_by: stored.updated_by, owner_email: stored.owner_email, editable: stored.editable };
        return [...current.filter((entry) => entry.key !== stored.key), summary].sort((left, right) => left.title.localeCompare(right.title));
      });
      setDraft({ key: stored.key, title: stored.title, slugs: [...stored.replication_slugs], expectedUpdatedAt: stored.updated_at });
      setSaveState("saved");
      setFeedback(stored.pruned.length > 0
        ? { tone: "warning", message: `Saved "${stored.title}". ${stored.pruned.length} ${stored.pruned.length === 1 ? "entry" : "entries"} named a work that no longer exists or is excluded everywhere, and were dropped.` }
        : { tone: "success", message: `Saved "${stored.title}".` });
    } catch {
      setSaveState("idle");
      setFeedback({ tone: "danger", message: "Could not reach the playlists endpoint." });
    } finally {
      savingRef.current = false;
    }
  }, [draft]);

  const remove = useCallback(async (playlist: ReplicationPlaylistSummary) => {
    if (savingRef.current || deletingKeysRef.current.has(playlist.key)) return;
    deletingKeysRef.current.add(playlist.key);
    setDeletingKeys((current) => new Set(current).add(playlist.key));
    try {
      const response = await fetch(`${PLAYLISTS_API}/${encodeURIComponent(playlist.key)}`, { method: "DELETE" });
      if (!response.ok) {
        setFeedback({ tone: "danger", message: await readError(response, `Could not delete "${playlist.title}".`) });
        return;
      }
      keyedRequestRef.current += 1;
      setFeedback({ tone: "success", message: `Deleted "${playlist.title}".` });
      setPlaylists((current) => current.filter((entry) => entry.key !== playlist.key));
      setDraft((current) => current?.key === playlist.key ? null : current);
      setSavedPlaylist((current) => current?.key === playlist.key ? null : current);
    } catch {
      setFeedback({ tone: "danger", message: "Could not reach the playlists endpoint." });
    } finally {
      deletingKeysRef.current.delete(playlist.key);
      setDeletingKeys((current) => { const next = new Set(current); next.delete(playlist.key); return next; });
    }
  }, []);

  return {
    playlists, loaded, draft, savedSlugs, isDirty, pendingTransition, deletingKeys, saveState,
    isSaving: saveState === "saving", feedback, setFeedback, openPlaylist, startNewPlaylist,
    closeDraft, discardPendingTransition, cancelPendingTransition: () => setPendingTransition(null),
    setDraftTitle, setDraftSlugs, resetDraft, save, remove, reload: () => setToken((value) => value + 1),
  };
}
