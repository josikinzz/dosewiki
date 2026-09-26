/**
 * Pure state and the HTTP client for the Playlists tab
 * (`/api/dev/replications/playlists`).
 *
 * A member's own replication playlists: the same rows the replication studio
 * edits, read through the same routes, but scoped by ownership. The studio's
 * key rule is reused so a playlist minted here is addressed the same way there.
 */

import { playlistKeyOf } from "@/features/dev/tools/replication-studio/replicationPlaylistModel";
import { devFetch } from "@/features/dev/tools/devFetch";

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

/** Titles named in one line of the save summary before it counts the rest. */
const SUMMARY_NAME_LIMIT = 6;

function nameList(slugs: readonly string[], labelOf: (slug: string) => string): string {
  const named = slugs.slice(0, SUMMARY_NAME_LIMIT).map(labelOf).join(", ");
  const rest = slugs.length - SUMMARY_NAME_LIMIT;
  return rest > 0 ? `${named}, and ${rest} more` : named;
}

const works = (count: number) => `${count} ${count === 1 ? "work" : "works"}`;

type PlaylistChangeSummary = {
  /** Plain sentences for the confirm, in reading order. */
  lines: string[];
  /** Entries on the draft that are not works a playlist can hold; saving leaves them out. */
  leftOut: string[];
};

/**
 * What a save will do, in words, for the confirm dialog. `labelOf` turns a
 * slug into the work's title where it is known; `unavailable` holds the slugs
 * the lookup could not find, which the server would drop on save.
 */
export function summarizePlaylistChange({
  before,
  after,
  labelOf,
  unavailable,
}: {
  before: { title: string; slugs: readonly string[] } | null;
  after: { title: string; slugs: readonly string[] };
  labelOf: (slug: string) => string;
  unavailable: ReadonlySet<string>;
}): PlaylistChangeSummary {
  const lines: string[] = [];
  const title = after.title.trim();
  const leftOut = after.slugs.filter((slug) => unavailable.has(slug));
  const kept = after.slugs.filter((slug) => !unavailable.has(slug));
  if (!before) {
    lines.push(`Creates "${title}" with ${works(kept.length)}.`);
    if (kept.length > 0) lines.push(`In order: ${nameList(kept, labelOf)}.`);
    return { lines, leftOut };
  }
  if (before.title !== title) lines.push(`Renames "${before.title}" to "${title}".`);
  const previous = new Set(before.slugs);
  const next = new Set(kept);
  const added = kept.filter((slug) => !previous.has(slug));
  const removed = before.slugs.filter((slug) => !next.has(slug));
  if (added.length > 0) lines.push(`Adds ${nameList(added, labelOf)}.`);
  if (removed.length > 0) lines.push(`Removes ${nameList(removed, labelOf)}.`);
  const stayed = before.slugs.filter((slug) => next.has(slug));
  const stayedInNewOrder = kept.filter((slug) => previous.has(slug));
  if (stayed.some((slug, index) => slug !== stayedInNewOrder[index])) lines.push("Changes the order.");
  lines.push(
    kept.length === before.slugs.length
      ? `The playlist keeps ${works(kept.length)}.`
      : `The playlist goes from ${works(before.slugs.length)} to ${works(kept.length)}.`,
  );
  return { lines, leftOut };
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

function requestJson(
  url: string,
  init: RequestInit | undefined,
  messages: { network: string; failure: string },
  byStatus: Record<number, () => Error> = {},
) {
  return devFetch(url, {
    ...init,
    messages,
    emptyBodyOk: true,
    onError: (status) => byStatus[status]?.(),
  });
}

/** The list row a stored playlist stands for, so a save updates the list without a second read. */
export function summaryOf(playlist: OwnedPlaylist): OwnedPlaylistSummary {
  return {
    key: playlist.key,
    title: playlist.title,
    work_count: playlist.replication_slugs.length,
    updated_at: playlist.updated_at,
    updated_by: playlist.updated_by,
    owner_email: playlist.owner_email,
    editable: playlist.editable,
  };
}

/** Rows in reading order: by name, the way the collection route sorts them. */
export function sortPlaylists<T extends { title: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => left.title.localeCompare(right.title));
}

/** Why Save cannot run right now, in words, or `null` when it can. */
export function saveBlocker(draft: PlaylistDraft): string | null {
  if (draft.title.trim().length === 0) return "Name the playlist to save it.";
  if (draft.key.length === 0) return "Use letters or numbers in the name, so the playlist gets a key.";
  return null;
}

/** A write refused because writes are frozen (the write boundary's wording). */
export function isWriteFreezeRefusal(message: string): boolean {
  return /frozen|writes are paused/i.test(message);
}

/**
 * The parts of a playlist a save changes, for the dock's state line and the
 * confirm heading: "the name and the order".
 */
export function changedPlaylistParts(draft: PlaylistDraft, saved: OwnedPlaylist | null): string[] {
  if (!saved) return [];
  const parts: string[] = [];
  if (draft.title !== saved.title) parts.push("the name");
  const before = new Set(saved.replication_slugs);
  const after = new Set(draft.slugs);
  const added = draft.slugs.some((slug) => !before.has(slug));
  const removed = saved.replication_slugs.some((slug) => !after.has(slug));
  if (added && removed) parts.push("which works it holds");
  else if (added) parts.push("added works");
  else if (removed) parts.push("removed works");
  const stayed = saved.replication_slugs.filter((slug) => after.has(slug));
  const stayedInNewOrder = draft.slugs.filter((slug) => before.has(slug));
  if (stayed.some((slug, index) => slug !== stayedInNewOrder[index])) parts.push("the order");
  return parts;
}
