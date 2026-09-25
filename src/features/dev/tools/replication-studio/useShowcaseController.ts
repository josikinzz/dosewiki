"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ConfirmRequest } from "@/features/dev/components";

import type { StudioRow } from "./replicationStudioModel";
import { currentSearch, type StudioWorkspaces } from "./useStudioWorkspaces";

/** Showcases are curated per drug article, or reviewed per replication. */
export type ShowcaseMode = "drug" | "replication";

/**
 * The Showcases workspace: which side of the placement it is read from, the
 * replication open in the per-work view, and the ways in from the other
 * workspaces. Each view holds its own draft, so switching views asks first.
 */
export function useShowcaseController({
  rows,
  workspaces,
  confirm,
}: {
  rows: readonly StudioRow[];
  workspaces: StudioWorkspaces;
  confirm: (request: ConfirmRequest) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ShowcaseMode>("drug");
  const [placementRowId, setPlacementRowId] = useState<string | null>(null);
  const { guardPlaylist, request, setShowcaseDirty, showcaseDirty } = workspaces;

  const requestMode = useCallback(
    (next: ShowcaseMode) => {
      if (next === mode) return;
      if (!showcaseDirty) {
        setMode(next);
        return;
      }
      confirm({
        title: "Leave the showcase with unsaved changes?",
        description:
          "This board has curation that was never saved. Switching views throws it away; the article keeps whatever is already stored.",
        cancelLabel: "Keep editing",
        confirmLabel: "Discard changes",
        destructive: true,
        onConfirm: () => {
          setShowcaseDirty(false);
          setMode(next);
        },
      });
    },
    [confirm, mode, setShowcaseDirty, showcaseDirty],
  );

  /** Opens one drug article's showcase. */
  const openArticle = useCallback(
    (slug: string) => {
      setMode("drug");
      router.push(`/dev/replications/${slug}${currentSearch()}`);
    },
    [router],
  );

  /** Opens one replication's drug-article placements. */
  const openPlacement = useCallback(
    (id: string) =>
      request("substances", () => {
        setPlacementRowId(id);
        setMode("replication");
      }),
    [request],
  );

  const placementRow = useMemo(
    () => rows.find((row) => row.id === placementRowId) ?? null,
    [placementRowId, rows],
  );

  return {
    mode,
    requestMode,
    placementRow,
    choosePlacementRow: setPlacementRowId,
    openArticle,
    /** Opens an article's showcase from Playlists, once an unsaved playlist is dealt with. */
    reviewArticle: (slug: string) => guardPlaylist(() => openArticle(slug)),
    openPlacement,
  };
}
