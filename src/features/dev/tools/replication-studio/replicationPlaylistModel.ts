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

export type PlaylistDraft = {
  key: string;
  title: string;
  slugs: string[];
  expectedUpdatedAt: string | null;
};

export function playlistKeyOf(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
