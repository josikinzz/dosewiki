import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "./publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS, publicArticleHistoryTag, PUBLIC_CHANGELOG_LISTS_TAG } from "./publicData.cacheTags";
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
import { publicChangelogSubmitter, redactChangelogEmails } from "../changelog/publicChangelog";
import {
  assemblePublicChangelogSummaries,
  PUBLIC_CHANGELOG_DIFF_CHAR_LIMIT,
  truncatePublicChangelogDiff,
  type PublicChangelogEntrySummary,
  type PublicChangelogSummary,
} from "../changelog/publicChangelogSummary";
import type { ContributorDirectory } from "../contributorDirectory";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import {
  expandLegacyContributorHandles,
  findContributorProfileByKeyOrAlias,
} from "../contributorProfileIdentity";
import { publicHref } from "../../src/utils/publicHref";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicChangelogRow } from "./publicData.shared";

const PUBLIC_PROFILE_HISTORY_LIMIT = 20;

export type PublicProfileHistoryEntry = Omit<ChangeLogEntry, "markdown"> & { hasDiff: boolean };

export const PUBLIC_PROFILE_DIFF_CHAR_LIMIT = PUBLIC_CHANGELOG_DIFF_CHAR_LIMIT;

type DataChangelogRow = Omit<PublicChangelogRow, "articles"> & { articles: ChangeLogArticleSummary[] };

function normalizeArticles(value: unknown): ChangeLogArticleSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (article): article is ChangeLogArticleSummary =>
      typeof article === "object" &&
      article !== null &&
      typeof article.title === "string" &&
      typeof article.slug === "string",
  ).map(({ id, title, slug }) => ({ id, title, slug }));
}

function normalizeDataRows(rows: unknown): PublicProfileHistoryEntry[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const entries: PublicProfileHistoryEntry[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      continue;
    }
    const candidate = row as Partial<DataChangelogRow>;
    if (typeof candidate.entryId !== "string" || typeof candidate.createdAt !== "string") {
      continue;
    }
    entries.push({
      id: candidate.entryId,
      createdAt: candidate.createdAt,
      commit: {
        sha: "",
        url: "",
        message: redactChangelogEmails(typeof candidate.message === "string" ? candidate.message : ""),
      },
      articles: normalizeArticles(candidate.articles),
      hasDiff: typeof candidate.markdown === "string" && candidate.markdown.trim().length > 0,
      submittedBy: publicChangelogSubmitter(candidate.submittedBy),
    });
  }
  return entries;
}

const readChangelogBySubmitters = cache(
  publicDataCache(async (submitters: string[]): Promise<PublicProfileHistoryEntry[]> => {
    return normalizeDataRows(
      await getPublicDataReadAdapter().getPublicChangelogBySubmitters(submitters, PUBLIC_PROFILE_HISTORY_LIMIT),
    );
  },
  ["data-public-changelog-by-submitter", "summaries-v2"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.changelog, PUBLIC_CHANGELOG_LISTS_TAG],
  },),
);

export const getPublicProfileHistory = cache(
  async (
    profile: Pick<NormalizedUserProfile, "key" | "aliases">,
    limit = PUBLIC_PROFILE_HISTORY_LIMIT,
  ): Promise<PublicProfileHistoryEntry[]> => {
    if (!publicChangelogSubmitter(profile.key)) return [];
    const submitterKeys = buildSubmitterKeySet(profile.key, profile.aliases);
    if (submitterKeys.size === 0) {
      return [];
    }

    const submitters = [
      ...new Set([...submitterKeys].flatMap((key) => [key, key.toLowerCase()])),
    ].sort();

    const liveEntries = await readChangelogBySubmitters(submitters);

    const liveIds = new Set(liveEntries.map((entry) => entry.id));
    const staticEntries = initialChangeLogEntries
      .filter((entry) => !liveIds.has(entry.id) && entryMatchesSubmitter(entry, submitterKeys))
      .map(({ markdown, ...entry }) => ({
        ...entry,
        commit: { ...entry.commit, message: redactChangelogEmails(entry.commit.message) },
        hasDiff: markdown.trim().length > 0,
      }));

    return sortChangeLogEntries([...liveEntries, ...staticEntries])
      .slice(0, limit)
      .map((entry) => ({
        ...entry,
        submittedBy: profile.key,
      }));
  },
);

const PUBLIC_ARTICLE_HISTORY_LIMIT = 8;

export const PUBLIC_CHANGES_PAGE_LIMIT = 60;

type StampedArticleChange = PublicChangelogSummary;

type EntrySummaryBatch = { ids: Set<string>; read: Promise<Map<string, PublicChangelogEntrySummary | null>> };

const ENTRY_SUMMARY_BATCH_SIZE = 200;

let pendingEntrySummaryBatch: EntrySummaryBatch | null = null;

function loadEntrySummary(id: string): Promise<PublicChangelogEntrySummary | null> {
  let batch = pendingEntrySummaryBatch;
  if (!batch) {
    const ids = new Set<string>();
    const created: EntrySummaryBatch = {
      ids,
      read: new Promise((resolve) => setTimeout(resolve, 0)).then(async () => {
        if (pendingEntrySummaryBatch === created) pendingEntrySummaryBatch = null;
        const batchIds = [...ids];
        const chunks = Array.from(
          { length: Math.ceil(batchIds.length / ENTRY_SUMMARY_BATCH_SIZE) },
          (_, index) => batchIds.slice(index * ENTRY_SUMMARY_BATCH_SIZE, (index + 1) * ENTRY_SUMMARY_BATCH_SIZE),
        );
        const entries = (await Promise.all(
          chunks.map((chunk) => getPublicDataReadAdapter().getPublicChangelogEntrySummaries(chunk)),
        )).flat();
        if (entries.length !== batchIds.length) {
          throw new Error(`changelog entry summaries returned ${entries.length} rows for ${batchIds.length} ids`);
        }
        return new Map(batchIds.map((batchId, index) => [batchId, entries[index]]));
      }),
    };
    pendingEntrySummaryBatch = batch = created;
  }
  batch.ids.add(id);
  return batch.read.then((entries) => entries.get(id) ?? null);
}

const readChangelogEntrySummary = cache(
  publicDataCache(
    loadEntrySummary,
    ["data-public-changelog-entry-summary", "v1"],
    {
      revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
      tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.changelog, PUBLIC_CHANGELOG_LISTS_TAG],
    },
  ),
);

async function assembleChangelogSummaries(ids: string[], subjectSlug: string | null): Promise<StampedArticleChange[]> {
  return assemblePublicChangelogSummaries(await Promise.all(ids.map((id) => readChangelogEntrySummary(id))), subjectSlug);
}

const readChangelogByArticleSlug = cache(
  publicDataCache(
  async (slug: string, limit: number): Promise<StampedArticleChange[]> =>
    assembleChangelogSummaries(await getPublicDataReadAdapter().getPublicChangelogEntryIdsByArticleSlug(slug, limit), slug),
  ["data-public-changelog-by-article-slug", "summaries-v4"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: (slug) => [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.changelog, publicArticleHistoryTag(slug)],
  },),
);

const readRecentChangelog = cache(
  publicDataCache(
    async (limit: number): Promise<StampedArticleChange[]> =>
      assembleChangelogSummaries(await getPublicDataReadAdapter().getPublicRecentChangelogEntryIds(limit), null),
  ["data-public-changelog-recent-changes", "summaries-v4"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.changelog, PUBLIC_CHANGELOG_LISTS_TAG],
  },),
);

function resolveContributors(
  rows: StampedArticleChange[],
  directory: ContributorDirectory,
): ArticleRecentChange[] {
  return rows.map(({ submittedBy, ...change }) => {
    if (!submittedBy) {
      return { ...change, contributor: null };
    }
    let profile: ContributorDirectory[number] | null = null;
    for (const handle of expandLegacyContributorHandles([submittedBy])) {
      profile = findContributorProfileByKeyOrAlias(directory, handle);
      if (profile) break;
    }
    return {
      ...change,
      contributor: profile && publicChangelogSubmitter(profile.key) && publicChangelogSubmitter(profile.displayName)
        ? {
            name: profile.displayName,
            href: publicHref.contributor(profile.key.toLowerCase()),
            avatarUrl: profile.avatarUrl ?? null,
          }
        : { name: "Contributor", href: null, avatarUrl: null },
    };
  });
}

export const getPublicArticleHistory = cache(
  async (
    slug: string,
    directory: ContributorDirectory | Promise<ContributorDirectory>,
    limit: number = PUBLIC_ARTICLE_HISTORY_LIMIT,
  ): Promise<ArticleRecentChange[]> => {
    return resolveContributors(await readChangelogByArticleSlug(slug, limit), await directory);
  },
);

export const getPublicRecentChanges = cache(
  async (
    directory: ContributorDirectory | Promise<ContributorDirectory>,
    limit: number = PUBLIC_CHANGES_PAGE_LIMIT,
  ): Promise<ArticleRecentChange[]> => {
    return resolveContributors(await readRecentChangelog(limit), await directory);
  },
);

const readChangelogEntry = cache(
  publicDataCache(
    async (entryId: string, _slug: string | null): Promise<PublicChangelogRow | null> =>
      getPublicDataReadAdapter().getPublicChangelogById(entryId),
    ["data-public-changelog-entry", "v1"],
    {
      revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
      tags: (_entryId, slug) => [
        PUBLIC_DATA_CACHE_TAGS.all,
        PUBLIC_DATA_CACHE_TAGS.changelog,
        PUBLIC_CHANGELOG_LISTS_TAG,
        ...(slug ? [publicArticleHistoryTag(slug)] : []),
      ],
    },
  ),
);

export const getPublicHistoryDiff = cache(async (entryId: string, slug: string | null = null, wholeEntry = false): Promise<string | null> => {
  const fallback = initialChangeLogEntries.find((entry) => entry.id === entryId);
  let live: PublicChangelogRow | null;
  try {
    live = await readChangelogEntry(entryId, slug);
  } catch (error) {
    if (!fallback) throw error;
    live = null;
  }
  if (!live && !fallback) return null;
  const articles = normalizeArticles(live?.articles ?? fallback?.articles);
  const article = slug ? articles.find((candidate) => candidate.slug === slug) : articles[0];
  if (slug && !article) return null;
  const markdown = redactChangelogEmails(live?.markdown ?? fallback?.markdown ?? "");
  return truncatePublicChangelogDiff(article && (slug || (!wholeEntry && articles.length === 1)) ? sliceArticleDiff(markdown, article) : markdown);
});
