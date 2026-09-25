"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { StudioWorkspace } from "./ReplicationStudioWorkspaceNav";

/** The current search string, so moving between studio routes keeps the Library's view. */
export function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

/**
 * Which workspace is open, and the guards on leaving one. Showcases and
 * Playlists each hold a draft that a switch would throw away, and the
 * Library's inspector holds another; each asks before it is lost.
 */
export function useStudioWorkspaces({
  initialSubstanceSlug,
  guardDraft,
}: {
  initialSubstanceSlug?: string;
  /** The shared selection's guard on the inspector draft. */
  guardDraft: (change: () => void) => void;
}) {
  const router = useRouter();
  const [active, setActive] = useState<StudioWorkspace>(
    initialSubstanceSlug ? "substances" : null,
  );
  const [showcaseDirty, setShowcaseDirty] = useState(false);
  const [playlistDirty, setPlaylistDirty] = useState(false);
  const [pendingShowcaseLeave, setPendingShowcaseLeave] = useState<{ next: StudioWorkspace } | null>(
    null,
  );
  const [pendingPlaylistLeave, setPendingPlaylistLeave] = useState<{ run: () => void } | null>(null);

  useEffect(() => {
    if (initialSubstanceSlug) setActive("substances");
  }, [initialSubstanceSlug]);

  const leaveShowcase = useCallback(
    (next: StudioWorkspace) => {
      setPendingShowcaseLeave(null);
      setShowcaseDirty(false);
      setActive(next);
      if (next === null && initialSubstanceSlug) router.push(`/dev/replications${currentSearch()}`);
    },
    [initialSubstanceSlug, router],
  );

  /** Runs `run` now, or once the editor confirms dropping the open playlist's changes. */
  const guardPlaylist = useCallback(
    (run: () => void) => {
      if (active === "playlists" && playlistDirty) setPendingPlaylistLeave({ run });
      else run();
    },
    [active, playlistDirty],
  );

  /**
   * Opens `next`. `prepare` runs inside the guards, right before the switch,
   * so state for the next workspace is only set once the switch is certain.
   */
  const request = useCallback(
    (next: StudioWorkspace, prepare?: () => void) => {
      if (active === next) return;
      if (active === "substances") {
        if (showcaseDirty) setPendingShowcaseLeave({ next });
        else leaveShowcase(next);
        return;
      }
      if (active === "playlists" && playlistDirty) {
        setPendingPlaylistLeave({
          run: () => {
            prepare?.();
            setActive(next);
          },
        });
        return;
      }
      guardDraft(() => {
        prepare?.();
        setPlaylistDirty(false);
        setActive(next);
      });
    },
    [active, guardDraft, leaveShowcase, playlistDirty, showcaseDirty],
  );

  return {
    active,
    request,
    guardPlaylist,
    showcaseDirty,
    setShowcaseDirty,
    setPlaylistDirty,
    /** Props for the studio's leave dialogs. */
    leaveDialogs: {
      pendingPlaylistLeave: pendingPlaylistLeave !== null,
      pendingShowcaseLeave: pendingShowcaseLeave !== null,
      onCancelPlaylistLeave: () => setPendingPlaylistLeave(null),
      onConfirmPlaylistLeave: () => {
        const pending = pendingPlaylistLeave;
        setPendingPlaylistLeave(null);
        setPlaylistDirty(false);
        pending?.run();
      },
      onCancelShowcaseLeave: () => setPendingShowcaseLeave(null),
      onConfirmShowcaseLeave: () => {
        if (pendingShowcaseLeave) leaveShowcase(pendingShowcaseLeave.next);
      },
    },
  };
}

export type StudioWorkspaces = ReturnType<typeof useStudioWorkspaces>;
