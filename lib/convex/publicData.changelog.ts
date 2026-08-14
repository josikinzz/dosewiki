import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  buildSubmitterKeySet,
  entryMatchesSubmitter,
  initialChangeLogEntries,
  sortChangeLogEntries,
  type ChangeLogArticleSummary,
  type ChangeLogEntry,
} from "../../src/data/changelog/changeLog";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
} from "./publicData.cache";
import { queryConvex } from "./serverClient";

/**
 * How many changelog rows one profile page shows. The UI groups rows by day
 * and collapses diffs, so this is comfortably above the old 5-entry cap while
 * the diff text keeps the payload the dominant cost.
 */
export const PUBLIC_PROFILE_HISTORY_LIMIT = 20;

type ConvexChangelogRow = {
  entryId: string;
  createdAt: string;
  message: string;
  markdown: string;
  submittedBy: string | null;
  articles: ChangeLogArticleSummary[];
};

function normalizeArticles(value: unknown): ChangeLogArticleSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (article): article is ChangeLogArticleSummary =>
      typeof article === "object" &&
      article !== null &&
      typeof (article as ChangeLogArticleSummary).title === "string" &&
      typeof (article as ChangeLogArticleSummary).slug === "string",
  );
}

function normalizeConvexRows(rows: unknown): ChangeLogEntry[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const entries: ChangeLogEntry[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      continue;
    }
    const candidate = row as Partial<ConvexChangelogRow>;
    if (typeof candidate.entryId !== "string" || typeof candidate.createdAt !== "string") {
      continue;
    }
    entries.push({
      id: candidate.entryId,
      createdAt: candidate.createdAt,
      commit: {
        sha: "",
        url: "",
        message: typeof candidate.message === "string" ? candidate.message : "",
      },
      articles: normalizeArticles(candidate.articles),
      markdown: typeof candidate.markdown === "string" ? candidate.markdown : "",
      submittedBy: typeof candidate.submittedBy === "string" ? candidate.submittedBy : null,
    });
  }
  return entries;
}

const readChangelogBySubmitters = cache(
  unstable_cache(
    async (submitters: string[]): Promise<ConvexChangelogRow[]> => {
      return await queryConvex<ConvexChangelogRow[], { submitters: string[]; limit: number }>(
        "changelog:getBySubmitter",
        { submitters, limit: PUBLIC_PROFILE_HISTORY_LIMIT },
      );
    },
    ["convex-public-changelog-by-submitter"],
    {
      revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
      tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.changelog],
    },
  ),
);

/**
 * The contributor's public changelog history.
 *
 * Live Convex rows are the source of truth; the static build-time snapshot
 * only backfills rows the deployment no longer carries (and keeps the section
 * alive when `changelog:getBySubmitter` is not deployed yet — additive query,
 * same degrade rationale as the replication portfolio read). Matching is
 * alias-aware: profile aliases and legacy stamp groups (WITCHY → LYREA) all
 * attribute to this profile.
 *
 * Every returned entry's `submittedBy` is rewritten to the canonical profile
 * key, so a legacy handle can never reach the public page payload.
 */
export const getPublicProfileHistory = cache(
  async (
    profile: Pick<NormalizedUserProfile, "key" | "aliases">,
    limit = PUBLIC_PROFILE_HISTORY_LIMIT,
  ): Promise<ChangeLogEntry[]> => {
    const submitterKeys = buildSubmitterKeySet(profile.key, profile.aliases);
    if (submitterKeys.size === 0) {
      return [];
    }

    // The Convex index match is exact, and legacy stamps carry both casings
    // ("WITCHY", "josie kins"), so query upper and lower case variants.
    const submitters = [
      ...new Set([...submitterKeys].flatMap((key) => [key, key.toLowerCase()])),
    ].sort();

    let liveEntries: ChangeLogEntry[] = [];
    try {
      liveEntries = normalizeConvexRows(await readChangelogBySubmitters(submitters));
    } catch (error) {
      console.warn(
        `[publicData] live changelog unavailable for ${profile.key}; falling back to the static snapshot.`,
        error,
      );
    }

    const liveIds = new Set(liveEntries.map((entry) => entry.id));
    const staticEntries = initialChangeLogEntries.filter(
      (entry) => !liveIds.has(entry.id) && entryMatchesSubmitter(entry, submitterKeys),
    );

    return sortChangeLogEntries([...liveEntries, ...staticEntries])
      .slice(0, limit)
      .map((entry) =>
        entry.submittedBy === profile.key ? entry : { ...entry, submittedBy: profile.key },
      );
  },
);
