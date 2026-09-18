import type { ChangeLogArticleSummary, ChangeLogEntry } from "@/data/changelog/changeLog";
import type { SaveArticlePayload, SaveArticleResult } from "@/hooks/useApiMutations";
import type { SubstanceArticle } from "@/schema";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import { slugify } from "@/utils/slug";
import { DEV_TAB_REGISTRY, findDevTab, type DevChromeTab, type DevModeTab } from "./devTabRegistry";

export type ArticleRecord = SubstanceArticle;

export type DevModePrimaryTab = "tools" | DevChromeTab;

/**
 * Tools that read the substance corpus. Only these wait on the library drain;
 * everything else fetches its own data and renders straight away.
 */
export const LIBRARY_DEPENDENT_TABS: ReadonlySet<DevModeTab> = new Set(
  DEV_TAB_REGISTRY.filter((tab) => tab.data.has("library")).map((tab) => tab.id),
);

/** Tabs that make the shell drain the editor corpus, including deferred consumers. */
export const LIBRARY_FETCHING_TABS: ReadonlySet<DevModeTab> = new Set(
  DEV_TAB_REGISTRY.filter((tab) => tab.data.has("library") || tab.data.has("library-deferred")).map(
    (tab) => tab.id,
  ),
);

export function tabNeedsLibrary(tab: DevModeTab): boolean {
  return LIBRARY_FETCHING_TABS.has(tab);
}

/** Tabs that read the shared changelog feed (`changelog.getRecent`). */
export function tabNeedsChangelogFeed(tab: DevModeTab): boolean {
  return findDevTab(tab).data.has("changelog");
}

/** Tabs that read the contributor profile directory. */
export function tabNeedsContributorProfiles(tab: DevModeTab): boolean {
  return findDevTab(tab).data.has("contributors");
}
/** Tabs that consume revision-bearing editor index layouts. */
export function tabNeedsIndexLayouts(tab: DevModeTab): boolean {
  return findDevTab(tab).data.has("layouts");
}

export type MarkdownChange = {
  markdown: string;
  hasChanges: boolean;
};

function isChromeTab(tab: DevModeTab): tab is DevChromeTab {
  return findDevTab(tab).group === "chrome";
}

export function resolvePrimaryTab(tab: DevModeTab): DevModePrimaryTab {
  return isChromeTab(tab) ? tab : "tools";
}

export function formatArticleLabel(article: unknown, index: number): string {
  if (!article || typeof article !== "object") {
    return `Article ${index + 1}`;
  }

  const record = article as { title?: string; id?: number };
  const parts: string[] = [];
  if (typeof record.title === "string" && record.title.trim().length > 0) {
    parts.push(record.title.trim());
  }

  if (typeof record.id === "number") {
    parts.push(`#${record.id}`);
  }

  if (parts.length === 0) {
    return `Article ${index + 1}`;
  }

  return parts.join(" · ");
}

export function mergeArticleWithOriginal(original: unknown, draft: ArticleRecord): ArticleRecord {
  if (!original || typeof original !== "object") {
    return draft;
  }

  const originalArticle = original as ArticleRecord;
  return {
    ...draft,
    id: draft.id ?? originalArticle.id,
  };
}

export function extractChangeLogSummary(record: unknown, index: number): ChangeLogArticleSummary | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const entry = record as {
    id?: unknown;
    title?: unknown;
    identification?: {
      common_name?: unknown;
    };
  };

  const rawId = entry.id;
  let idValue: number | null = null;
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    idValue = rawId;
  } else if (typeof rawId === "string" && rawId.trim().length > 0) {
    const parsed = Number.parseInt(rawId.trim(), 10);
    if (Number.isFinite(parsed)) {
      idValue = parsed;
    }
  }

  if (idValue === null) {
    return null;
  }

  const rawTitle = typeof entry.title === "string" ? entry.title.trim() : "";
  const commonName =
    typeof entry.identification?.common_name === "string" ? entry.identification.common_name.trim() : "";

  const title = rawTitle || commonName || `Article ${index + 1}`;
  const slugSource = commonName || title || `article-${idValue}`;
  const slug = slugify(slugSource) || `article-${idValue}`;

  return {
    id: idValue,
    title,
    slug,
  };
}

function collectChangedMarkdownSegments(changes: readonly MarkdownChange[]): string[] {
  return changes
    .filter((change) => change.hasChanges)
    .map((change) => change.markdown.trimEnd())
    .filter((segment) => segment.length > 0);
}

export function buildCombinedChangelogMarkdown(changes: readonly MarkdownChange[]): string {
  const segments = collectChangedMarkdownSegments(changes);

  if (segments.length === 0) {
    return "# Changes\n\nNo differences detected.\n";
  }

  return segments.join("\n\n---\n\n");
}

export function buildCommitMarkdown(changes: readonly MarkdownChange[]): string {
  const segments = collectChangedMarkdownSegments(changes);
  return segments.length > 0 ? `${segments.join("\n\n---\n\n")}\n` : "";
}

export function getChangedArticles(
  articles: readonly ArticleRecord[],
  originalArticles: readonly ArticleRecord[],
): ArticleRecord[] {
  return articles.filter((article, index) => {
    const original = originalArticles[index];
    if (!original) {
      return true;
    }
    return JSON.stringify(article) !== JSON.stringify(original);
  });
}

export function buildDataSavePayload({
  articles,
  originalArticles,
  datasetChangelog,
}: {
  articles: readonly ArticleRecord[];
  originalArticles: readonly ArticleRecord[];
  datasetChangelog: DatasetChangelogResult;
}): {
  changedArticles: ArticleRecord[];
  payload: SaveArticlePayload;
} {
  const changedArticles = getChangedArticles(articles, originalArticles);

  return {
    changedArticles,
    payload: {
      articles: changedArticles,
      changelog:
        changedArticles.length > 0 && datasetChangelog.sections.length > 0
          ? {
              markdown: datasetChangelog.markdown,
              articles: datasetChangelog.articles.map((article) => ({
                id: article.id,
                title: article.title,
                slug: article.slug,
              })),
            }
          : undefined,
    },
  };
}

export function normalizeDataChangeLogEntry(
  entry: NonNullable<SaveArticleResult["entry"]>,
): ChangeLogEntry {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    commit: {
      sha: entry.commit.sha,
      url: entry.commit.url,
      message: entry.commit.message,
    },
    articles: entry.articles,
    markdown: entry.markdown,
    submittedBy: entry.submittedBy,
  };
}
