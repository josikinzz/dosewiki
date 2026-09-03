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
import {
  sliceArticleDiff,
  type ArticleRecentChange,
} from "../../src/data/changelog/articleRecentChanges";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { ContributorDirectory } from "../contributorDirectory";
import {
  findContributorProfileByKeyOrAlias,
  toContributorDisplayName,
} from "../contributorProfileIdentity";
import { publicHref } from "../../src/utils/publicHref";
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

/**
 * Diff text longer than this is cut at a line boundary and closed with a
 * `@@ diff truncated … @@` marker line — the profile diff viewer already
 * styles `@@` lines as hunk info, so the marker needs no UI change.
 *
 * The cap is what keeps the cached history inside Next's 2 MB
 * `unstable_cache` entry limit ("items over 2MB can not be cached"). Bulk
 * Dev-editor saves write ~500 KB diffs spanning hundreds of articles, and a
 * run of them once put 4.6 MB of raw rows behind this read, so the cached
 * loader for /contributors/JOSIE overflowed and every ISR render refetched
 * from Convex. Bounded, the worst case is 20 rows × (50 KB diff + ~30 KB of
 * article summaries) ≈ 1.7 MB serialized. Fifty thousand characters is also
 * ~1,000 rendered diff lines, past the point where the collapsed expander is
 * a useful way to read a change anyway.
 */
export const PUBLIC_PROFILE_DIFF_CHAR_LIMIT = 50_000;

function truncateDiffMarkdown(markdown: string): string {
  if (markdown.length <= PUBLIC_PROFILE_DIFF_CHAR_LIMIT) {
    return markdown;
  }
  const head = markdown.slice(0, PUBLIC_PROFILE_DIFF_CHAR_LIMIT);
  const lastLineBreak = head.lastIndexOf("\n");
  const kept = lastLineBreak > 0 ? head.slice(0, lastLineBreak) : head;
  const omittedLines = markdown.slice(kept.length).split("\n").length - 1;
  return `${kept}\n@@ diff truncated: ${omittedLines} more lines @@`;
}

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
      markdown: truncateDiffMarkdown(typeof candidate.markdown === "string" ? candidate.markdown : ""),
      submittedBy: typeof candidate.submittedBy === "string" ? candidate.submittedBy : null,
    });
  }
  return entries;
}

const readChangelogBySubmitters = cache(
  unstable_cache(
    // Normalization (and its diff cap) runs *inside* the cache boundary: the
    // cached value is the projected entries, not the raw Convex rows, so a
    // contributor's history can never outgrow the 2 MB entry limit no matter
    // how large the stored diffs are.
    async (submitters: string[]): Promise<ChangeLogEntry[]> => {
      return normalizeConvexRows(
        await queryConvex<ConvexChangelogRow[], { submitters: string[]; limit: number }>(
          "changelog:getBySubmitter",
          { submitters, limit: PUBLIC_PROFILE_HISTORY_LIMIT },
        ),
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
      liveEntries = await readChangelogBySubmitters(submitters);
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

/**
 * How many human edits one article page lists. The disclosure is collapsed by
 * default and each row collapses its diff, so the cap is about payload, not
 * screen space: 8 rows × ≤50 KB sliced diff stays far inside the 2 MB cache
 * entry limit.
 */
export const PUBLIC_ARTICLE_HISTORY_LIMIT = 8;

type ConvexArticleChangelogRow = Omit<ConvexChangelogRow, "articles"> & { articles: unknown };

/** The cached, per-article projection before contributor resolution. */
type StampedArticleChange = Omit<ArticleRecentChange, "contributor"> & {
  submittedBy: string | null;
};

const readChangelogByArticleSlug = cache(
  unstable_cache(
    // Slicing to this article and the diff cap both run inside the cache
    // boundary: a bulk save's 500 KB multi-article diff never reaches the
    // cached value, only this article's section of it.
    async (slug: string): Promise<StampedArticleChange[]> => {
      const rows = await queryConvex<ConvexArticleChangelogRow[], { slug: string; limit: number }>(
        "changelog:getByArticleSlug",
        { slug, limit: PUBLIC_ARTICLE_HISTORY_LIMIT },
      );
      if (!Array.isArray(rows)) {
        return [];
      }
      const changes: StampedArticleChange[] = [];
      for (const row of rows) {
        if (typeof row !== "object" || row === null) continue;
        if (typeof row.entryId !== "string" || typeof row.createdAt !== "string") continue;
        const articles = normalizeArticles(row.articles);
        const article = articles.find((candidate) => candidate.slug === slug);
        if (!article) continue;
        const markdown = typeof row.markdown === "string" ? row.markdown : "";
        changes.push({
          id: row.entryId,
          createdAt: row.createdAt,
          message: typeof row.message === "string" ? row.message : "",
          diff: truncateDiffMarkdown(sliceArticleDiff(markdown, article)),
          articleCount: articles.length,
          submittedBy: typeof row.submittedBy === "string" ? row.submittedBy : null,
        });
      }
      return changes;
    },
    ["convex-public-changelog-by-article-slug"],
    {
      revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
      tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.changelog],
    },
  ),
);

/**
 * The human edits recorded against one article, newest first, for the public
 * article page. Only signed-in editor saves write changelog rows (agent and
 * script pipelines mutate articles without one), so every row here is a human
 * edit by construction.
 *
 * Contributor identity resolves here against the directory so the page never
 * ships raw submitter stamps for known profiles. Returns [] when the query is
 * not deployed yet or Convex is unreachable: the disclosure simply does not
 * render, which is the same thing an unedited article shows.
 */
export const getPublicArticleHistory = cache(
  async (slug: string, directory: ContributorDirectory): Promise<ArticleRecentChange[]> => {
    let rows: StampedArticleChange[] = [];
    try {
      rows = await readChangelogByArticleSlug(slug);
    } catch (error) {
      console.warn(`[publicData] article changelog unavailable for ${slug}; hiding recent changes.`, error);
      return [];
    }

    return rows.map(({ submittedBy, ...change }) => {
      if (!submittedBy) {
        return { ...change, contributor: null };
      }
      const profile = findContributorProfileByKeyOrAlias(directory, submittedBy);
      return {
        ...change,
        contributor: profile
          ? {
              name: profile.displayName,
              href: publicHref.contributor(profile.key.toLowerCase()),
              avatarUrl: profile.avatarUrl ?? null,
            }
          : { name: toContributorDisplayName(submittedBy), href: null, avatarUrl: null },
      };
    });
  },
);
