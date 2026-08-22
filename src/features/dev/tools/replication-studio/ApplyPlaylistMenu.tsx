"use client";

/**
 * Apply a saved playlist to the substance whose gallery is open.
 *
 * This is a draft edit, not a publish: it pins the playlist's works into the
 * curation the editor is already holding, and the gallery's own Save is still
 * the only thing that reaches an article. The menu says so, because "apply" is
 * the word most likely to be read as "publish".
 */

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { usePlaylistsController } from "./usePlaylistsController";
import type { ReplicationPlaylist } from "./replicationPlaylistModel";

export type ApplyPlaylistMenuProps = {
  /** Slugs this substance actually matches; a playlist entry outside it cannot go on the article. */
  matchedSlugs: ReadonlySet<string>;
  onApply: (playlist: ReplicationPlaylist) => void;
};

export function ApplyPlaylistMenu({ matchedSlugs, onApply }: ApplyPlaylistMenuProps) {
  const { playlists, loaded } = usePlaylistsController();

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
          Applying pins works into this draft. Nothing reaches the article until you save the
          gallery.
        </p>
        {!loaded ? (
          <p className="theme-text-muted text-sm">Loading playlists…</p>
        ) : playlists.length === 0 ? (
          <p className="theme-text-muted text-sm">
            No playlists yet. Build one in the studio&apos;s Playlists panel.
          </p>
        ) : (
          <ul className="space-y-1">
            {playlists.map((playlist) => {
              // Counted before the click so the editor can tell a playlist that
              // fits this substance from one that does not.
              const applicable = playlist.replication_slugs.filter((slug) =>
                matchedSlugs.has(slug),
              ).length;
              return (
                <li key={playlist.key} className="list-none">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    disabled={applicable === 0}
                    onClick={() => onApply(playlist)}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{playlist.title}</span>
                    <span className="theme-text-faint shrink-0 font-mono text-xs">
                      {applicable === 0
                        ? "none match"
                        : `${applicable}/${playlist.replication_slugs.length}`}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
