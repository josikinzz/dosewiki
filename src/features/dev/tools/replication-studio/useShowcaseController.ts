"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ConfirmRequest } from "@/features/dev/components";

import type { StudioRow } from "./replicationStudioModel";
import { currentSearch, type StudioWorkspaces } from "./useStudioWorkspaces";

export type ShowcaseMode = "drug" | "replication";

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

  const openArticle = useCallback(
    (slug: string) => {
      setMode("drug");
      router.push(`/dev/replications/${slug}${currentSearch()}`);
    },
    [router],
  );

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
    reviewArticle: (slug: string) => guardPlaylist(() => openArticle(slug)),
    openPlacement,
  };
}
