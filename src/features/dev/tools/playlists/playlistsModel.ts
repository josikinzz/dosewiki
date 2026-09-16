/**
 * Pure state and the HTTP client for the Playlists tab
 * (`/api/dev/replications/playlists`).
 *
 * A member's own replication playlists: the same rows the replication studio
 * edits, read through the same routes, but scoped by ownership. The studio's
 * key rule is reused so a playlist minted here is addressed the same way there.
 */

import { playlistKeyOf } from "@/features/dev/tools/replication-studio/replicationPlaylistModel";

export { playlistKeyOf };

/** Compact playlist metadata returned by the collection route. */
export type OwnedPlaylistSummary = {
  key: string;
  title: string;
  work_count: number;
  updated_at: string;
  updated_by: string | null;
  owner_email: string | null;
  /** Whether the signed-in member may change this row (owner or admin). */
  editable: boolean;
};

/** Complete playlist returned by keyed reads and mutations. */
export type OwnedPlaylist = Omit<OwnedPlaylistSummary, "work_count"> & {
  replication_slugs: string[];
};

/** The playlist being edited: an existing key, or a new one not yet saved. */
export type PlaylistDraft = {
  key: string;
  title: string;
  slugs: string[];
  /** The `updated_at` this draft was loaded from; `null` for a playlist that does not exist yet. */
  expectedUpdatedAt: string | null;
  /**
   * Admin only, and only while creating: the member the new playlist belongs
   * to. An existing playlist's owner is changed through `assignPlaylistOwner`,
   * not through this draft.
   */
  ownerEmail: string;
};

export function draftOf(playlist: OwnedPlaylist): PlaylistDraft {
  return {
    key: playlist.key,
    title: playlist.title,
    slugs: [...playlist.replication_slugs],
    expectedUpdatedAt: playlist.updated_at,
    ownerEmail: playlist.owner_email ?? "",
  };
}

export const EMPTY_DRAFT: PlaylistDraft = {
  key: "",
  title: "",
  slugs: [],
  expectedUpdatedAt: null,
  ownerEmail: "",
};

/** Move the entry at `index` one step; out-of-range moves return the same array. */
export function moveSlug(slugs: readonly string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (index < 0 || index >= slugs.length || target < 0 || target >= slugs.length) {
    return [...slugs];
  }
  const next = [...slugs];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function isDraftDirty(draft: PlaylistDraft, saved: OwnedPlaylist | null): boolean {
  if (!saved) {
    return draft.title.trim().length > 0 || draft.slugs.length > 0 || draft.ownerEmail.trim().length > 0;
  }
  return (
    draft.title !== saved.title ||
    draft.slugs.length !== saved.replication_slugs.length ||
    draft.slugs.some((slug, index) => slug !== saved.replication_slugs[index])
  );
}

const BASE_PATH = "/api/dev/replications/playlists";

export async function fetchPlaylists(): Promise<OwnedPlaylistSummary[]> {
  const payload = await requestJson(BASE_PATH, undefined, {
    network: "Network error while loading playlists.",
    failure: "Unable to load playlists.",
  });
  return Array.isArray(payload.playlists) ? (payload.playlists as OwnedPlaylistSummary[]) : [];
}
/** Fetch one deep-linked playlist without waiting for the collection projection. */
export async function fetchPlaylist(key: string): Promise<OwnedPlaylist> {
  const payload = await requestJson(`${BASE_PATH}/${encodeURIComponent(key)}`, undefined, {
    network: "Network error while loading that playlist.",
    failure: "Unable to load that playlist.",
  });
  if (typeof payload.playlist !== "object" || payload.playlist === null) {
    throw new Error("The playlist route returned no playlist.");
  }
  return payload.playlist as OwnedPlaylist;
}


export class PlaylistConflictError extends Error {
  constructor() {
    super("This playlist changed since you opened it. Reload to see the stored version before saving again.");
    this.name = "PlaylistConflictError";
  }
}

/** Create or replace one playlist. `ownerEmail` is only sent on create, by an admin. */
export async function savePlaylist(
  draft: PlaylistDraft,
  options: { sendOwner: boolean },
): Promise<OwnedPlaylist & { pruned: string[] }> {
  const body: Record<string, unknown> = {
    key: draft.key,
    title: draft.title,
    slugs: draft.slugs,
    expectedUpdatedAt: draft.expectedUpdatedAt,
  };
  if (options.sendOwner && draft.ownerEmail.trim().length > 0) {
    body.ownerEmail = draft.ownerEmail.trim();
  }
  const payload = await requestJson(
    BASE_PATH,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    { network: "Network error while saving the playlist.", failure: "Unable to save that playlist." },
    { 409: () => new PlaylistConflictError() },
  );
  const playlist: unknown = payload.playlist;
  if (!playlist || typeof playlist !== "object" || !("key" in playlist)) {
    throw new Error("The playlist route returned no playlist.");
  }
  return playlist as OwnedPlaylist & { pruned: string[] };
}

export async function deletePlaylist(key: string): Promise<void> {
  await requestJson(
    `${BASE_PATH}/${encodeURIComponent(key)}`,
    { method: "DELETE" },
    { network: "Network error while deleting the playlist.", failure: "Unable to delete that playlist." },
  );
}

/** Admin: hand a playlist to a member, or (`null`) leave it unowned. */
export async function assignPlaylistOwner(
  key: string,
  ownerEmail: string | null,
): Promise<{ key: string; owner_email: string | null; updated_at: string; updated_by: string | null }> {
  const payload = await requestJson(
    `${BASE_PATH}/${encodeURIComponent(key)}/owner`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerEmail }),
    },
    { network: "Network error while changing the owner.", failure: "Unable to change that playlist's owner." },
  );
  return payload as { key: string; owner_email: string | null; updated_at: string; updated_by: string | null };
}

async function requestJson(
  url: string,
  init: RequestInit | undefined,
  messages: { network: string; failure: string },
  byStatus: Record<number, () => Error> = {},
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = init ? await fetch(url, init) : await fetch(url);
  } catch {
    throw new Error(messages.network);
  }

  const payload: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok) {
    const special = byStatus[response.status];
    if (special) throw special();
    throw new Error(typeof payload.error === "string" ? payload.error : messages.failure);
  }
  return payload;
}
