/**
 * The bounded, public-safe work lookup behind the Playlists tab's visual
 * composer (`/api/dev/replications/playlist-candidates`).
 *
 * A contributor has no reason to load the studio's whole corpus, so the tab
 * asks this read two questions: "which works match these words" (at most
 * {@link CANDIDATE_SEARCH_LIMIT} answers) and "what are these slugs" (at most
 * {@link CANDIDATE_SLUG_LIMIT}, the playlist ceiling). Both answer from the
 * published corpus the public site already serves, projected down to what a
 * thumbnail card draws, and only works a playlist can hold.
 */

import { isShowcaseEligible, type SubstanceGalleryMatchableRow } from "@/data/substanceReplicationGallery";

/** Results returned for one search. */
export const CANDIDATE_SEARCH_LIMIT = 24;
/** Slugs resolved in one request; matches the playlist ceiling. */
export const CANDIDATE_SLUG_LIMIT = 250;
/** Longest search accepted, in characters. */
export const CANDIDATE_QUERY_MAX = 80;

/** What a playlist card draws, and nothing else. */
export type PlaylistCandidate = {
  slug: string;
  title: string;
  artist: string;
  type: "image" | "video" | "audio";
  thumbnail_url: string | null;
  /** Stills are their own thumbnail; never set for video or audio. */
  url: string | null;
  duration: number | null;
};

export type CandidateSourceRow = SubstanceGalleryMatchableRow & {
  artist: string;
  thumbnail_url?: string | null;
  url?: string | null;
  duration?: number | null;
  created_at?: string;
};

function projectCandidate(row: CandidateSourceRow): PlaylistCandidate {
  return {
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    type: row.type,
    thumbnail_url: row.thumbnail_url ?? null,
    url: row.type === "image" ? (row.url ?? null) : null,
    duration: typeof row.duration === "number" ? row.duration : null,
  };
}

/**
 * Newest first, only works a playlist may hold. Words match the title, the
 * artist or the slug, every word somewhere; an empty search lists the newest.
 */
export function searchCandidates(rows: readonly CandidateSourceRow[], query: string): PlaylistCandidate[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .filter(isShowcaseEligible)
    .filter((row) => {
      if (words.length === 0) return true;
      const haystack = `${row.title} ${row.artist} ${row.slug}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .sort((left, right) => (right.created_at ?? "").localeCompare(left.created_at ?? "") || left.slug.localeCompare(right.slug))
    .slice(0, CANDIDATE_SEARCH_LIMIT)
    .map(projectCandidate);
}

/** The eligible works among `slugs`, in the order asked; unknown slugs are simply absent. */
export function resolveCandidates(rows: readonly CandidateSourceRow[], slugs: readonly string[]): PlaylistCandidate[] {
  const bySlug = new Map(rows.filter(isShowcaseEligible).map((row) => [row.slug, row]));
  return slugs.flatMap((slug) => {
    const row = bySlug.get(slug);
    return row ? [projectCandidate(row)] : [];
  });
}

const ENDPOINT = "/api/dev/replications/playlist-candidates";

async function requestCandidates(params: URLSearchParams): Promise<PlaylistCandidate[]> {
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${params.toString()}`);
  } catch {
    throw new Error("Network error while looking up works.");
  }
  const payload: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Unable to look up works right now.");
  }
  return Array.isArray(payload.candidates) ? (payload.candidates as PlaylistCandidate[]) : [];
}

export function fetchCandidateSearch(query: string): Promise<PlaylistCandidate[]> {
  return requestCandidates(new URLSearchParams({ q: query.slice(0, CANDIDATE_QUERY_MAX) }));
}

export function fetchCandidatesBySlug(slugs: readonly string[]): Promise<PlaylistCandidate[]> {
  return requestCandidates(new URLSearchParams({ slugs: slugs.slice(0, CANDIDATE_SLUG_LIMIT).join(",") }));
}
