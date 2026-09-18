/**
 * Pure state for reusable replication playlists.
 *
 * A playlist is a named, ordered set of replication slugs. It publishes
 * nothing: applying one edits a substance gallery's draft, and the gallery
 * curation stays the single publish gate. Keeping the merge and key rules here
 * means the panel, the apply affordance, and the tests all agree on them.
 */

export type ReplicationPlaylistSummary = {
  key: string;
  title: string;
  work_count: number;
  updated_at: string;
  updated_by: string | null;
  owner_email: string | null;
  editable: boolean;
};

export type ReplicationPlaylist = Omit<ReplicationPlaylistSummary, "work_count"> & {
  replication_slugs: string[];
};

/** The playlist being edited: an existing key, or a new one not yet saved. */
export type PlaylistDraft = {
  key: string;
  title: string;
  slugs: string[];
  /** The `updated_at` this draft was loaded from; `null` for a playlist that does not exist yet. */
  expectedUpdatedAt: string | null;
};

/**
 * A stable key from a display name. Playlists are addressed by key in the API
 * and the stored row, so the key is minted once from the name an editor typed
 * and then never follows a rename — a renamed playlist is the same playlist.
 */
export function playlistKeyOf(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Merge a playlist into a curation draft.
 *
 * Playlist order is appended after whatever is already curated, and a work
 * already on the article keeps its existing position: an editor applying a
 * playlist to a half-curated article is adding to their work, not replacing it.
 * Excluded slugs are skipped rather than resurrected, because an exclusion is a
 * decision about this article and the playlist knows nothing about it.
 */
export function applyPlaylistToCuration({
  curated,
  removed,
  playlistSlugs,
}: {
  curated: readonly string[];
  removed: readonly string[];
  playlistSlugs: readonly string[];
}): { curated: string[]; added: string[]; alreadyPresent: string[]; skippedExcluded: string[] } {
  const already = new Set(curated);
  const excluded = new Set(removed);
  const added: string[] = [];
  const skippedExcluded: string[] = [];
  const alreadyPresent: string[] = [];

  for (const slug of playlistSlugs) {
    if (already.has(slug)) {
      alreadyPresent.push(slug);
      continue;
    }
    if (excluded.has(slug)) {
      skippedExcluded.push(slug);
      continue;
    }
    already.add(slug);
    added.push(slug);
  }

  return { curated: [...curated, ...added], added, alreadyPresent, skippedExcluded };
}
