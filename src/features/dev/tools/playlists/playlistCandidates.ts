import { isShowcaseEligible, type SubstanceGalleryMatchableRow } from "@/data/substanceReplicationGallery";
import { devFetch } from "../devFetch";

export const CANDIDATE_SEARCH_LIMIT = 24;
export const CANDIDATE_SLUG_LIMIT = 250;
export const CANDIDATE_QUERY_MAX = 80;

export type PlaylistCandidate = {
  slug: string;
  title: string;
  artist: string;
  type: "image" | "video" | "audio";
  thumbnail_url: string | null;
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

export function resolveCandidates(rows: readonly CandidateSourceRow[], slugs: readonly string[]): PlaylistCandidate[] {
  const bySlug = new Map(rows.filter(isShowcaseEligible).map((row) => [row.slug, row]));
  return slugs.flatMap((slug) => {
    const row = bySlug.get(slug);
    return row ? [projectCandidate(row)] : [];
  });
}

const ENDPOINT = "/api/dev/replications/playlist-candidates";

async function requestCandidates(params: URLSearchParams): Promise<PlaylistCandidate[]> {
  const { candidates } = await devFetch(`${ENDPOINT}?${params.toString()}`, {
    messages: {
      network: "Network error while looking up works.",
      failure: "Unable to look up works right now.",
    },
  });
  if (!Array.isArray(candidates)) {
    throw new Error("The server did not return the work list.");
  }
  return candidates as PlaylistCandidate[];
}

export function fetchCandidateSearch(query: string): Promise<PlaylistCandidate[]> {
  return requestCandidates(new URLSearchParams({ q: query.slice(0, CANDIDATE_QUERY_MAX) }));
}

export function fetchCandidatesBySlug(slugs: readonly string[]): Promise<PlaylistCandidate[]> {
  return requestCandidates(new URLSearchParams({ slugs: slugs.slice(0, CANDIDATE_SLUG_LIMIT).join(",") }));
}
