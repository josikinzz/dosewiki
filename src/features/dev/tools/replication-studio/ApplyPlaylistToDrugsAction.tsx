"use client";

import { useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ReplicationPlaylist, ReplicationPlaylistSummary } from "./replicationPlaylistModel";
import {
  placeReplicationsOnSubstances,
  type PlacementTargetResult,
} from "./replicationPlacementService";
import { fetchReplicationPlaylist } from "./usePlaylistsController";
import { SubstanceTargetPicker } from "./SubstanceTargetPicker";

export type ApplyPlaylistToDrugsActionProps = {
  playlist: ReplicationPlaylistSummary;
  onReviewGallery: (substanceSlug: string) => void;
};

function resultLabel(result: PlacementTargetResult): string {
  if (result.status === "conflict") {
    return result.message
      ? `Conflict — ${result.message}`
      : "Conflict — gallery changed before this copy could save";
  }
  if (result.status === "error") return result.message ?? "Could not update this gallery";
  if (result.status === "unchanged") return "No change needed";
  return "Gallery saved";
}

/**
 * A one-time copy of a saved playlist into several independently-versioned drug
 * galleries. Nothing here stores the playlist key on a gallery: later playlist
 * edits therefore cannot rewrite an application that already happened.
 */
export function ApplyPlaylistToDrugsAction({
  playlist,
  onReviewGallery,
}: ApplyPlaylistToDrugsActionProps) {
  const [open, setOpen] = useState(false);
  const [fullPlaylist, setFullPlaylist] = useState<ReplicationPlaylist | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [results, setResults] = useState<PlacementTargetResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function openDialog() {
    setSelectedSlugs([]);
    setResults(null);
    setLoadError(null);
    setFullPlaylist(null);
    setOpen(true);
    try {
      setFullPlaylist(await fetchReplicationPlaylist(playlist.key));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load that playlist.");
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSelectedSlugs([]);
      setResults(null);
    }
  }

  async function apply() {
    if (busy || !fullPlaylist || selectedSlugs.length === 0 || fullPlaylist.replication_slugs.length === 0) return;
    setBusy(true);
    setResults(null);
    try {
      setResults(
        await placeReplicationsOnSubstances({
          substanceSlugs: selectedSlugs,
          replicationSlugs: [...fullPlaylist.replication_slugs],
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => void openDialog()}>
        <Icon icon="lucide:copy-plus" size={14} />
        Apply to drugs
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[min(90vh,46rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply “{playlist.title}” to drugs</DialogTitle>
            <DialogDescription>
              {fullPlaylist
                ? `Copy this playlist’s current ${fullPlaylist.replication_slugs.length} work${fullPlaylist.replication_slugs.length === 1 ? "" : "s"} into each selected gallery once.`
                : "Load this playlist’s current saved contents before choosing target galleries."}
              {" "}This does not link the galleries to the playlist, and later playlist edits will not change them.
            </DialogDescription>
          </DialogHeader>

          {loadError ? (
            <div className="space-y-2" role="alert">
              <p className="text-sm">{loadError}</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void openDialog()}>
                Retry
              </Button>
            </div>
          ) : null}
          <SubstanceTargetPicker
            selectedSlugs={selectedSlugs}
            onSelectedSlugsChange={setSelectedSlugs}
            disabled={busy || results !== null || fullPlaylist === null}
            busy={busy}
            label="Target drugs"
          />

          {results === null ? (
            <div
              className="rounded-lg border border-[color:var(--editor-chip-border)] p-3 text-sm"
              aria-label="Application preflight"
            >
              <p className="font-medium">
                {selectedSlugs.length} target{selectedSlugs.length === 1 ? "" : "s"} ·{" "}
                {fullPlaylist?.replication_slugs.length ?? 0} playlist work
                {fullPlaylist?.replication_slugs.length === 1 ? "" : "s"}
              </p>
              <p className="theme-text-muted mt-1 text-xs">
                Existing positions stay in place. Excluded works stay excluded. Each target is
                fetched again and saved with its current version when you confirm.
              </p>
            </div>
          ) : (
            <ul className="space-y-2" aria-live="polite" aria-label="Application results">
              {results.map((result) => (
                <li
                  key={result.substanceSlug}
                  className="rounded-lg border border-[color:var(--editor-chip-border)] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{result.substanceTitle}</p>
                      <p className="theme-text-muted text-xs">{resultLabel(result)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="textLink"
                      size="auto"
                      onClick={() => onReviewGallery(result.substanceSlug)}
                    >
                      Review gallery
                    </Button>
                  </div>
                  <p className="theme-text-muted mt-2 font-mono text-xs">
                    {result.added.length} added · {result.alreadyPresent.length} already present ·{" "}
                    {result.excluded.length} excluded · {result.ineligible.length} ineligible
                  </p>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            {results === null ? (
              <>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  disabled={
                    busy || selectedSlugs.length === 0 || !fullPlaylist ||
                    fullPlaylist.replication_slugs.length === 0
                  }
                  onClick={() => void apply()}
                >
                  <Icon
                    icon={busy ? "lucide:loader-2" : "lucide:copy-plus"}
                    size={14}
                    className={busy ? "animate-spin" : undefined}
                  />
                  {busy ? "Applying…" : `Apply to ${selectedSlugs.length || "selected"}`}
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
