"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { StudioWorkspace } from "./ReplicationStudioWorkspaceNav";

export function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

export function useStudioWorkspaces({
  initialSubstanceSlug,
  guardDraft,
}: {
  initialSubstanceSlug?: string;
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

  const guardPlaylist = useCallback(
    (run: () => void) => {
      if (active === "playlists" && playlistDirty) setPendingPlaylistLeave({ run });
      else run();
    },
    [active, playlistDirty],
  );

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
