import type { ChangeLogArticleSummary, ChangeLogEntry } from "@/data/changelog/changeLog";
import type { SaveArticlesResult, SaveToConvexPayload, SaveToConvexResult } from "@/hooks/useApiMutations";
import type { SubstanceArticle } from "@/schema";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import { slugify } from "@/utils/slug";

export type ArticleRecord = SubstanceArticle;

export type DevModeTab =
  | "change-log"
  | "tag-editor"
  | "profile"
  | "index-layout"
  | "writing"
  | "blog"
  | "copy-studio"
  | "contributors"
  | "citation-review"
  | "trip-report-submissions"
  | "article-feedback"
  | "site-feedback"
  | "articles"
  | "molecule-editor"
  | "replications"
  | "review";

export type DevModePrimaryTab = "tools" | "change-log" | "profile";

/**
 * Tools that read the substance corpus. Only these wait on the library drain;
 * everything else fetches its own data and renders straight away.
 */
export const LIBRARY_DEPENDENT_TABS: ReadonlySet<DevModeTab> = new Set<DevModeTab>([
  "articles",
  "citation-review",
  "index-layout",
  "tag-editor",
  "change-log",
]);

/**
 * Tabs that make the shell drain the editor corpus at all.
 *
 * This is the blocking set plus `writing`, which hosts the About editor whose
 * placeholder counts are derived from the library but which renders straight
 * away with them filled in late. Every other tab — profile, trip reports,
 * article feedback, the molecule editor, the replication studio, the blog —
 * reads none of it and must issue zero corpus requests.
 */
export const LIBRARY_FETCHING_TABS: ReadonlySet<DevModeTab> = new Set<DevModeTab>([
  ...LIBRARY_DEPENDENT_TABS,
  "writing",
]);

export function tabNeedsLibrary(tab: DevModeTab): boolean {
  return LIBRARY_FETCHING_TABS.has(tab);
}

/**
 * Tabs that read the shared changelog feed (`changelog.getRecent`): the change
 * log itself, and the profile tab's contribution history.
 */
export function tabNeedsChangelogFeed(tab: DevModeTab): boolean {
  return tab === "change-log" || tab === "profile";
}

/**
 * Tabs that read the contributor profile directory: the profile editor, the
 * Contributors curation tab, the Writing tab (the About founder picker plus the
 * byline picker), the Blog tab's byline picker, and the changelog attribution
 * used by the change log and by the save flows that commit from the corpus
 * tools.
 *
 * The Contributors and Blog tabs are here and deliberately not in
 * `LIBRARY_FETCHING_TABS`: they curate people and posts, and read not one
 * substance article.
 */
export function tabNeedsContributorProfiles(tab: DevModeTab): boolean {
  return (
    tab === "profile" ||
    tab === "writing" ||
    tab === "blog" ||
    tab === "contributors" ||
    LIBRARY_DEPENDENT_TABS.has(tab)
  );
}

export type MarkdownChange = {
  markdown: string;
  hasChanges: boolean;
};

export function resolvePrimaryTab(tab: DevModeTab): DevModePrimaryTab {
  if (
    tab === "tag-editor" ||
    tab === "index-layout" ||
    tab === "writing" ||
    tab === "blog" ||
    tab === "copy-studio" ||
    tab === "contributors" ||
    tab === "citation-review" ||
    tab === "trip-report-submissions" ||
    tab === "article-feedback" ||
    tab === "site-feedback" ||
    tab === "articles" ||
    tab === "molecule-editor" ||
    tab === "replications" ||
    tab === "review"
  ) {
    return "tools";
  }
  if (tab === "change-log") {
    return "change-log";
  }
  return "profile";
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

export function buildConvexSavePayload({
  articles,
  originalArticles,
  hasAboutChanges,
  aboutMarkdown,
  aboutSubtitle,
  aboutFounderKeys,
  datasetChangelog,
}: {
  articles: readonly ArticleRecord[];
  originalArticles: readonly ArticleRecord[];
  hasAboutChanges: boolean;
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  datasetChangelog: DatasetChangelogResult;
}): {
  changedArticles: ArticleRecord[];
  payload: SaveToConvexPayload;
} {
  const changedArticles = getChangedArticles(articles, originalArticles);

  return {
    changedArticles,
    payload: {
      articles: changedArticles,
      about: hasAboutChanges
        ? {
            aboutMarkdown,
            aboutSubtitle,
            founderProfileKeys: aboutFounderKeys,
          }
        : undefined,
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

export function normalizeConvexChangeLogEntry(
  entry: NonNullable<SaveToConvexResult["entry"]>,
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

export function normalizeGitHubChangeLogEntry(
  entry: SaveArticlesResult["entry"] | undefined,
  fallbackMessage: string,
  resolvedKey: string,
): ChangeLogEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const articles = Array.isArray(entry.articles)
    ? entry.articles.filter(
        (article): article is ChangeLogArticleSummary =>
          typeof article === "object" &&
          article !== null &&
          typeof (article as { id?: unknown }).id === "number" &&
          typeof (article as { title?: unknown }).title === "string" &&
          typeof (article as { slug?: unknown }).slug === "string",
      )
    : [];
  const markdown = (entry as { markdown?: unknown }).markdown;

  return {
    id: entry.timestamp,
    createdAt: entry.timestamp,
    commit: {
      sha: entry.commit?.sha ?? "",
      url: entry.commit?.url ?? "",
      message: entry.commit?.message ?? fallbackMessage,
    },
    articles,
    markdown: typeof markdown === "string" ? markdown : "",
    submittedBy: entry.submittedBy ?? resolvedKey,
  };
}
