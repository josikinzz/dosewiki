"use client";

/**
 * Apply a saved playlist to the substance whose gallery is open.
 *
 * Playlist membership is a direct editorial placement, not an effect-match
 * claim. The resulting draft still has to pass through the gallery's explicit
 * Save action before it reaches the article.
 */

import { useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import type { ReplicationPlaylist } from "./replicationPlaylistModel";
import type { StudioRow } from "./replicationStudioModel";
import { fetchReplicationPlaylist, usePlaylistsController } from "./usePlaylistsController";

export type PlaylistApplicationSummary = {
  added: readonly string[];
  alreadyPresent: readonly string[];
  excluded: readonly string[];
  ineligible: readonly string[];
};

export type ApplyPlaylistMenuProps = {
  corpusRows: readonly StudioRow[];
  onApply: (playlist: ReplicationPlaylist) => PlaylistApplicationSummary;
};

export function ApplyPlaylistMenu({ corpusRows: _corpusRows, onApply }: ApplyPlaylistMenuProps) {
  const { playlists, loaded } = usePlaylistsController();
  const [summary, setSummary] = useState<{
    title: string;
    result: PlaylistApplicationSummary;
  } | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <Icon icon="lucide:list-music" size={15} />
          Apply playlist
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2">
        <p className="theme-text-muted text-xs">
          Applying copies showcase-eligible works into this draft. Nothing reaches the article until
          you save the gallery.
        </p>
        {summary ? (
          <div
            className="theme-text-muted rounded-md border border-[color:var(--editor-chip-border)] p-2 text-xs"
            role="status"
          >
            <p className="theme-text font-medium">{summary.title}</p>
            <p>
              {summary.result.added.length} added · {summary.result.alreadyPresent.length} already
              present · {summary.result.excluded.length} excluded ·{" "}
              {summary.result.ineligible.length} ineligible
            </p>
          </div>
        ) : null}
        {!loaded ? (
          <p className="theme-text-muted text-sm">Loading playlists…</p>
        ) : playlists.length === 0 ? (
          <p className="theme-text-muted text-sm">
            No playlists yet. Build one in the studio&apos;s Playlists panel.
          </p>
        ) : (
          <ul className="space-y-1">
            {playlists.map((playlist) => (
              <li key={playlist.key} className="list-none">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  disabled={loadingKey !== null}
                  onClick={() => {
                    setLoadingKey(playlist.key);
                    setLoadError(null);
                    void fetchReplicationPlaylist(playlist.key)
                      .then((full) => {
                        setSummary({ title: full.title, result: onApply(full) });
                      })
                      .catch((error) => {
                        setLoadError(error instanceof Error ? error.message : "Could not load that playlist.");
                      })
                      .finally(() => setLoadingKey(null));
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{playlist.title}</span>
                  <span className="theme-text-faint shrink-0 font-mono text-xs">
                    {loadingKey === playlist.key ? "Loading…" : `${playlist.work_count} works`}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        {loadError ? <p className="text-sm" role="alert">{loadError}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
