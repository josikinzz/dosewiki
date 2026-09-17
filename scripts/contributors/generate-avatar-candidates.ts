// Pure contributor-work eligibility and candidate ranking.
import featuredReplications from "@data/effects/effectIndexFeaturedReplications.json";
import {
  profileMatchesName,
  sanitizeContributorAvatarUrl,
} from "../../lib/contributorProfileIdentity";
import { isPublishableReplication } from "../../src/types/replications";

const FEATURED_SLUGS: Readonly<Record<string, true>> = Object.fromEntries(
  featuredReplications.slugs.map((slug) => [slug, true]),
);

export function isFeaturedReplication(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(FEATURED_SLUGS, slug);
}

export type ReplicationRow = {
  slug: string;
  title?: string;
  artist: string;
  artist_url?: string;
  type: "image" | "video" | "audio";
  role?: "replication" | "figure";
  storage_id: string;
  url?: string;
  credit_line?: string;
  rights_status?: string;
  source_url?: string;
  rightsholder?: string;
};

export type ProfileRow = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarUrl?: string | null;
};

export type Dimensions = { width: number; height: number };
export type AvatarCandidate = {
  slug: string;
  type: "image" | "video";
  featured: boolean;
  /** `min(width, height)`: the largest square this source can yield. */
  squareSide: number;
};

/* ----------------------------------------------------------------- selection */

/**
 * The eligible works of one contributor: publishable replications whose credit
 * line resolves to them through the shared matcher.
 */
export function worksForProfile(
  profile: { displayName: string; aliases: readonly string[] },
  replications: readonly ReplicationRow[],
): ReplicationRow[] {
  return replications
    .filter((row) => isPublishableReplication(row))
    .filter((row) => profileMatchesName(profile, row.artist));
}

/**
 * Narrow a contributor's works to the tier the avatar must come from, before any
 * pixel is fetched: curated works if there are any, then stills if the surviving
 * set has any. Steps 1 and 2 of the ordering, and the only steps that can be
 * decided from stored metadata alone.
 */
export function preferredTier<Row extends { slug: string; type: string }>(works: readonly Row[]): Row[] {
  const curated = works.filter((row) => isFeaturedReplication(row.slug));
  const tier = curated.length > 0 ? curated : works;
  const stills = tier.filter((row) => row.type === "image");
  return stills.length > 0 ? stills : tier.filter((row) => row.type === "video");
}

/**
 * Steps 3 and 4, applied to a tier whose sources have been measured. Separated
 * from `preferredTier` because it is the half that costs a network round trip.
 */
export function rankMeasuredCandidates(candidates: readonly AvatarCandidate[]): AvatarCandidate[] {
  return [...candidates].sort(
    (left, right) => right.squareSide - left.squareSide || left.slug.localeCompare(right.slug),
  );
}
export type PlanEntry = {
  key: string;
  displayName: string;
  worksConsidered: number;
  tierSize: number;
  candidates: AvatarCandidate[];
  winner: AvatarCandidate;
  replication: ReplicationRow;
  mediaUrl: string;
  dimensions: Dimensions;
  duration?: number;
};

export function hasStoredAvatar(profile: ProfileRow): boolean {
  return Boolean(sanitizeContributorAvatarUrl(profile.avatarUrl));
}
