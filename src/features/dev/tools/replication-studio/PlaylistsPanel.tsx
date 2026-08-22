"use client";

/**
 * Reusable replication playlists.
 *
 * A playlist is a named, ordered set of works an editor builds once and applies
 * to any substance's curation draft. It publishes nothing on its own — the
 * gallery curation stays the single publish gate — which is what makes it safe
 * to reuse one opener across a whole family of substances.
 *
 * Membership reuses the studio's own ordering panel: everything above its
 * divider is in the playlist, in order, and everything below is the rest of the
 * corpus under the studio's current search and filters.
 */
import { useId } from "react";


import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyStateSurface, InteractiveContentCard } from "@/components/ui/surface";
import { ActionNotice, EditorSection, EditorStatusPill } from "@/features/dev/components";
import { OrderingPanel, type OrderablePanelItem } from "@/features/dev/tools/contributors/OrderingPanel";

import { usePlaylistsController } from "./usePlaylistsController";
import type { ReplicationPlaylist } from "./replicationPlaylistModel";

export type PlaylistsPanelProps = {
  /** Corpus rows under the studio's current search and filters. */
  items: readonly OrderablePanelItem[];
};

/**
 * A playlist's in/out decision is membership, not publication — "Curate" here
 * would read as though the playlist itself reaches an article.
 */
const PLAYLIST_VERBS = {
  add: "Add",
  remove: "Remove",
  addIcon: "lucide:plus",
  removeIcon: "lucide:minus",
  divider: "Not in this playlist",
  headEmpty: "This playlist is empty. Add works from the list below.",
} as const;

function PlaylistRow({
  playlist,
  active,
  onOpen,
  onDelete,
}: {
  playlist: ReplicationPlaylist;
  active: boolean;
  onOpen: (playlist: ReplicationPlaylist) => void;
  onDelete: (playlist: ReplicationPlaylist) => void;
}) {
  return (
    <li className="list-none">
      <InteractiveContentCard variant="public" padding="sm" radius="lg">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="theme-text-primary truncate text-sm font-medium">{playlist.title}</p>
            <p className="theme-text-faint truncate text-xs">
              {playlist.replication_slugs.length} work
              {playlist.replication_slugs.length === 1 ? "" : "s"} · saved{" "}
              {playlist.updated_at.slice(0, 10)} by {playlist.updated_by ?? "unknown"}
            </p>
          </div>
          {active ? <EditorStatusPill tone="info">Editing</EditorStatusPill> : null}
          <Button variant="secondary" size="sm" onClick={() => onOpen(playlist)}>
            <Icon icon="lucide:pencil" size={14} />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Delete ${playlist.title}`}
            onClick={() => onDelete(playlist)}
          >
            <Icon icon="lucide:trash-2" size={14} />
          </Button>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

export function PlaylistsPanel({ items }: PlaylistsPanelProps) {
  const controller = usePlaylistsController();
  const { playlists, loaded, draft, savedSlugs, saveState, feedback } = controller;
  const titleFieldId = useId();

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:list-music"
      title="Replication playlists"
      description="A playlist is a named, ordered set of works you can apply to any substance's showcase draft. Applying one never publishes: it fills the gallery's draft, and you still review and save that gallery."
    >
      {feedback ? (
        <ActionNotice tone={feedback.tone} onDismiss={() => controller.setFeedback(null)}>
          {feedback.message}
        </ActionNotice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="accent" size="sm" onClick={controller.startNewPlaylist}>
          <Icon icon="lucide:plus" size={15} />
          New playlist
        </Button>
        <Button variant="ghost" size="sm" onClick={controller.reload}>
          <Icon icon="lucide:refresh-cw" size={15} />
          Reload
        </Button>
      </div>

      {!loaded ? (
        <p className="theme-text-muted text-sm">Loading the playlists…</p>
      ) : playlists.length === 0 ? (
        <EmptyStateSurface padding="sm" radius="lg" className="space-y-1.5 text-sm">
          <p className="theme-text-primary font-medium">No playlists yet.</p>
          <p className="theme-text-muted">
            Build one from the corpus below, then apply it to any substance from the Substances
            panel.
          </p>
        </EmptyStateSurface>
      ) : (
        <ul className="space-y-2">
          {playlists.map((playlist) => (
            <PlaylistRow
              key={playlist.key}
              playlist={playlist}
              active={draft?.key === playlist.key}
              onOpen={controller.openPlaylist}
              onDelete={(entry) => void controller.remove(entry)}
            />
          ))}
        </ul>
      )}

      {draft ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label
                htmlFor={titleFieldId}
                className="theme-text-muted block text-[11px] uppercase tracking-[0.24em]"
              >
                Playlist name
              </label>
              <Input
                id={titleFieldId}
                value={draft.title}
                placeholder="Classic psychedelic opener"
                onChange={(event) => controller.setDraftTitle(event.target.value)}
              />
            </div>
            {draft.key ? (
              <span className="theme-text-faint font-mono text-xs">{draft.key}</span>
            ) : null}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={controller.closeDraft}>
              <Icon icon="lucide:x" size={15} />
              Close
            </Button>
          </div>

          <OrderingPanel
            icon="lucide:list-music"
            title={draft.title.trim().length > 0 ? draft.title : "New playlist"}
            description="Everything above the divider is in the playlist, in this order. Everything below it is the rest of the corpus, following the studio's current search and filters."
            items={items}
            order={draft.slugs}
            savedOrder={savedSlugs}
            emptyLabel="No replications match the current filters."
            saveState={saveState}
            verbs={PLAYLIST_VERBS}
            onOrderChange={controller.setDraftSlugs}
            onSave={() => void controller.save()}
            onReset={() => controller.setDraftSlugs([...savedSlugs])}
          />
        </div>
      ) : null}
    </EditorSection>
  );
}
