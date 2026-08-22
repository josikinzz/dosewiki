"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { EditorActionStatusState } from "@/features/dev/components";
import {
  playlistKeyOf,
  type PlaylistDraft,
  type ReplicationPlaylist,
} from "./replicationPlaylistModel";

const PLAYLISTS_API = "/api/dev/replications/playlists";

type Feedback = { tone: "success" | "warning" | "danger"; message: string };

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
export function usePlaylistsController() {
  const [playlists, setPlaylists] = useState<ReplicationPlaylist[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState(0);
  const [draft, setDraft] = useState<PlaylistDraft | null>(null);
  const [saveState, setSaveState] = useState<EditorActionStatusState | "idle">("idle");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

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
        // A 200 that is not the shape this hook expects is a broken endpoint,
        // not a list of zero playlists — and it must not take the panel that
        // hosts this menu down with it.
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

  const savedSlugs = useMemo(() => {
    if (!draft) return [];
    return playlists.find((entry) => entry.key === draft.key)?.replication_slugs ?? [];
  }, [draft, playlists]);

  const openPlaylist = useCallback((playlist: ReplicationPlaylist) => {
    setDraft({
      key: playlist.key,
      title: playlist.title,
      slugs: [...playlist.replication_slugs],
      expectedUpdatedAt: playlist.updated_at,
    });
    setSaveState("idle");
  }, []);

  const startNewPlaylist = useCallback(() => {
    setDraft({ key: "", title: "", slugs: [], expectedUpdatedAt: null });
    setSaveState("idle");
  }, []);

  const closeDraft = useCallback(() => {
    setDraft(null);
    setSaveState("idle");
  }, []);

  const setDraftTitle = useCallback((title: string) => {
    setDraft((current) => {
      if (!current) return current;
      // The key is minted once, on the first save. A rename keeps the address so
      // a playlist stays the same playlist wherever it has already been used.
      const key = current.expectedUpdatedAt === null ? playlistKeyOf(title) : current.key;
      return { ...current, title, key };
    });
    setSaveState("idle");
  }, []);

  const setDraftSlugs = useCallback((slugs: string[]) => {
    setDraft((current) => (current ? { ...current, slugs } : current));
    setSaveState("idle");
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    if (draft.title.trim().length === 0 || draft.key.length === 0) {
      setFeedback({ tone: "warning", message: "A playlist needs a name before it can be saved." });
      return;
    }
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
        playlist: { pruned: string[]; updated_at: string };
      };
      setSaveState("saved");
      setDraft((current) =>
        current ? { ...current, expectedUpdatedAt: payload.playlist.updated_at } : current,
      );
      setFeedback(
        payload.playlist.pruned.length > 0
          ? {
              tone: "warning",
              message: `Saved "${draft.title}". ${payload.playlist.pruned.length} entr${
                payload.playlist.pruned.length === 1 ? "y" : "ies"
              } named a work that no longer exists or is excluded everywhere, and were dropped.`,
            }
          : { tone: "success", message: `Saved "${draft.title}".` },
      );
      setToken((value) => value + 1);
    } catch {
      setSaveState("idle");
      setFeedback({ tone: "danger", message: "Could not reach the playlists endpoint." });
    }
  }, [draft]);

  const remove = useCallback(
    async (playlist: ReplicationPlaylist) => {
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
        setDraft((current) => (current?.key === playlist.key ? null : current));
        setToken((value) => value + 1);
      } catch {
        setFeedback({ tone: "danger", message: "Could not reach the playlists endpoint." });
      }
    },
    [],
  );

  return {
    playlists,
    loaded,
    draft,
    savedSlugs,
    saveState,
    feedback,
    setFeedback,
    openPlaylist,
    startNewPlaylist,
    closeDraft,
    setDraftTitle,
    setDraftSlugs,
    save,
    remove,
    reload: () => setToken((value) => value + 1),
  };
}
