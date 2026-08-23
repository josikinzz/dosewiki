"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EditorActionStatusState } from "@/features/dev/components";
import {
  playlistKeyOf,
  type PlaylistDraft,
  type ReplicationPlaylist,
} from "./replicationPlaylistModel";

const PLAYLISTS_API = "/api/dev/replications/playlists";

type Feedback = { tone: "success" | "warning" | "danger"; message: string };
type DraftTransition =
  | { kind: "close" }
  | { kind: "new" }
  | { kind: "open"; playlist: ReplicationPlaylist };

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

/**
 * Playlist list + one editable draft.
 *
 * Loading is deliberately eager and cheap: playlists are a handful of small
 * documents, and the gallery panel needs their names to offer "Apply playlist"
 * without a second round trip when an editor reaches for it.
 */
export function usePlaylistsController({
  onDirtyChange,
}: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const [playlists, setPlaylists] = useState<ReplicationPlaylist[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState(0);
  const [draft, setDraft] = useState<PlaylistDraft | null>(null);
  const [pendingTransition, setPendingTransition] = useState<DraftTransition | null>(null);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(() => new Set());
  const [saveState, setSaveState] = useState<EditorActionStatusState | "idle">("idle");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const deletingKeysRef = useRef(new Set<string>());
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(PLAYLISTS_API);
        if (!response.ok) {
          if (!cancelled) {
            setFeedback({
              tone: "danger",
              message: await readError(response, "Could not load the playlists."),
            });
          }
          return;
        }
        const payload = (await response.json()) as { playlists?: unknown };
        if (!Array.isArray(payload.playlists)) {
          if (!cancelled) {
            setFeedback({
              tone: "danger",
              message: "The playlists endpoint returned something unreadable.",
            });
          }
          return;
        }
        if (!cancelled) {
          setPlaylists(payload.playlists as ReplicationPlaylist[]);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setFeedback({ tone: "danger", message: "Could not reach the playlists endpoint." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const savedPlaylist = useMemo(() => {
    if (!draft || draft.expectedUpdatedAt === null) return null;
    return playlists.find((entry) => entry.key === draft.key) ?? null;
  }, [draft, playlists]);
  const savedSlugs = savedPlaylist?.replication_slugs ?? [];
  const isDirty = useMemo(() => {
    if (!draft) return false;
    if (!savedPlaylist) {
      return draft.title.trim().length > 0 || draft.slugs.length > 0;
    }
    return (
      draft.title !== savedPlaylist.title ||
      !slugListsEqual(draft.slugs, savedPlaylist.replication_slugs)
    );
  }, [draft, savedPlaylist]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const applyTransition = useCallback((transition: DraftTransition) => {
    if (savingRef.current) return;
    if (transition.kind === "close") {
      setDraft(null);
    } else if (transition.kind === "new") {
      setDraft({ key: "", title: "", slugs: [], expectedUpdatedAt: null });
    } else {
      const { playlist } = transition;
      setDraft({
        key: playlist.key,
        title: playlist.title,
        slugs: [...playlist.replication_slugs],
        expectedUpdatedAt: playlist.updated_at,
      });
    }
    setSaveState("idle");
  }, []);

  const requestTransition = useCallback(
    (transition: DraftTransition) => {
      if (savingRef.current) return;
      if (isDirty) {
        setPendingTransition(transition);
        return;
      }
      applyTransition(transition);
    },
    [applyTransition, isDirty],
  );

  const openPlaylist = useCallback(
    (playlist: ReplicationPlaylist) => {
      if (draft?.key === playlist.key) return;
      requestTransition({ kind: "open", playlist });
    },
    [draft?.key, requestTransition],
  );
  const startNewPlaylist = useCallback(
    () => requestTransition({ kind: "new" }),
    [requestTransition],
  );
  const closeDraft = useCallback(
    () => requestTransition({ kind: "close" }),
    [requestTransition],
  );
  const discardPendingTransition = useCallback(() => {
    if (savingRef.current || !pendingTransition) return;
    applyTransition(pendingTransition);
    setPendingTransition(null);
  }, [applyTransition, pendingTransition]);

  const setDraftTitle = useCallback((title: string) => {
    if (savingRef.current) return;
    setDraft((current) => {
      if (savingRef.current || !current) return current;
      const key = current.expectedUpdatedAt === null ? playlistKeyOf(title) : current.key;
      return { ...current, title, key };
    });
    setSaveState("idle");
  }, []);
  const resetDraft = useCallback(() => {
    if (savingRef.current) return;
    if (savedPlaylist) {
      setDraft({
        key: savedPlaylist.key,
        title: savedPlaylist.title,
        slugs: [...savedPlaylist.replication_slugs],
        expectedUpdatedAt: savedPlaylist.updated_at,
      });
    } else if (draft) {
      setDraft({ key: "", title: "", slugs: [], expectedUpdatedAt: null });
    }
    setSaveState("idle");
  }, [draft, savedPlaylist]);


  const setDraftSlugs = useCallback((slugs: string[]) => {
    if (savingRef.current) return;
    setDraft((current) =>
      savingRef.current || !current ? current : { ...current, slugs },
    );
    setSaveState("idle");
  }, []);

  const save = useCallback(async () => {
    if (savingRef.current || !draft) return;
    if (draft.title.trim().length === 0 || draft.key.length === 0) {
      setFeedback({ tone: "warning", message: "A playlist needs a name before it can be saved." });
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      const response = await fetch(PLAYLISTS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: draft.key,
          title: draft.title,
          slugs: draft.slugs,
          expectedUpdatedAt: draft.expectedUpdatedAt,
        }),
      });
      if (response.status === 409) {
        setSaveState("idle");
        setFeedback({
          tone: "warning",
          message: `"${draft.title}" changed since you opened it. Reload the playlists to see the stored version before saving again.`,
        });
        return;
      }
      if (!response.ok) {
        setSaveState("idle");
        setFeedback({
          tone: "danger",
          message: await readError(response, `Could not save "${draft.title}".`),
        });
        return;
      }
      const payload = (await response.json()) as {
        playlist: ReplicationPlaylist & { pruned: string[] };
      };
      const stored = payload.playlist;
      const saved: ReplicationPlaylist = {
        key: stored.key,
        title: stored.title,
        replication_slugs: stored.replication_slugs,
        updated_at: stored.updated_at,
        updated_by: stored.updated_by,
      };
      setPlaylists((current) => {
        const exists = current.some((entry) => entry.key === saved.key);
        return exists
          ? current.map((entry) => (entry.key === saved.key ? saved : entry))
          : [...current, saved].sort((left, right) => left.title.localeCompare(right.title));
      });
      setDraft({
        key: saved.key,
        title: saved.title,
        slugs: [...saved.replication_slugs],
        expectedUpdatedAt: saved.updated_at,
      });
      setSaveState("saved");
      setFeedback(
        stored.pruned.length > 0
          ? {
              tone: "warning",
              message: `Saved "${saved.title}". ${stored.pruned.length} entr${
                stored.pruned.length === 1 ? "y" : "ies"
              } named a work that no longer exists or is excluded everywhere, and were dropped.`,
            }
          : { tone: "success", message: `Saved "${saved.title}".` },
      );
    } catch {
      setSaveState("idle");
      setFeedback({ tone: "danger", message: "Could not reach the playlists endpoint." });
    } finally {
      savingRef.current = false;
    }
  }, [draft]);

  const remove = useCallback(
    async (playlist: ReplicationPlaylist) => {
      if (savingRef.current) return;
      if (deletingKeysRef.current.has(playlist.key)) return;
      deletingKeysRef.current.add(playlist.key);
      setDeletingKeys((current) => new Set(current).add(playlist.key));
      try {
        const response = await fetch(`${PLAYLISTS_API}/${encodeURIComponent(playlist.key)}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          setFeedback({
            tone: "danger",
            message: await readError(response, `Could not delete "${playlist.title}".`),
          });
          return;
        }
        setFeedback({ tone: "success", message: `Deleted "${playlist.title}".` });
        setPlaylists((current) => current.filter((entry) => entry.key !== playlist.key));
        setDraft((current) =>
          savingRef.current || current?.key !== playlist.key ? current : null,
        );
      } catch {
        setFeedback({ tone: "danger", message: "Could not reach the playlists endpoint." });
      } finally {
        deletingKeysRef.current.delete(playlist.key);
        setDeletingKeys((current) => {
          const next = new Set(current);
          next.delete(playlist.key);
          return next;
        });
      }
    },
    [],
  );

  return {
    playlists,
    loaded,
    draft,
    savedSlugs,
    isDirty,
    pendingTransition,
    deletingKeys,
    saveState,
    isSaving: saveState === "saving",
    feedback,
    setFeedback,
    openPlaylist,
    startNewPlaylist,
    closeDraft,
    discardPendingTransition,
    cancelPendingTransition: () => setPendingTransition(null),
    setDraftTitle,
    setDraftSlugs,
    resetDraft,
    save,
    remove,
    reload: () => setToken((value) => value + 1),
  };
}
