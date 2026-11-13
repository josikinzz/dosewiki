import {
  articleDiffSlicer,
  describeChange,
  mergeSourceChurn,
  type ArticleRecentChange,
  type ChangeDescription,
} from "../../src/data/changelog/articleRecentChanges";
import type { ChangeLogArticleSummary } from "../../src/data/changelog/changeLog";
import { publicChangelogSubmitter, redactChangelogEmails } from "./publicChangelog";

export const PUBLIC_CHANGELOG_DIFF_CHAR_LIMIT = 50_000;

export type PublicChangelogSummaryInput = {
  entryId: string;
  createdAt: string;
  message: string;
  markdown: string;
  submittedBy?: string | null;
  articles: ChangeLogArticleSummary[];
};

export type PublicChangelogSummary = Omit<ArticleRecentChange, "contributor"> & {
  submittedBy: string | null;
};

type PublicChangelogEntryChange = ChangeDescription & { hasDiff: boolean };

export type PublicChangelogEntrySummary = {
  id: string;
  createdAt: string;
  submittedBy: string | null;
  articles: ChangeLogArticleSummary[];
  wholeEntry: PublicChangelogEntryChange;
  byArticle: (PublicChangelogEntryChange | null)[];
};

export function truncatePublicChangelogDiff(markdown: string): string {
  if (markdown.length <= PUBLIC_CHANGELOG_DIFF_CHAR_LIMIT) {
    return markdown;
  }
  const head = markdown.slice(0, PUBLIC_CHANGELOG_DIFF_CHAR_LIMIT);
  const lastLineBreak = head.lastIndexOf("\n");
  const kept = lastLineBreak > 0 ? head.slice(0, lastLineBreak) : head;
  const omittedLines = markdown.slice(kept.length).split("\n").length - 1;
  return `${kept}\n@@ diff truncated: ${omittedLines} more lines @@`;
}

export function projectPublicChangelogEntrySummary(
  row: PublicChangelogSummaryInput,
): PublicChangelogEntrySummary | null {
  if (typeof row.entryId !== "string" || typeof row.createdAt !== "string") return null;
  const articles = row.articles.map(({ id, title, slug }) => ({ id, title, slug }));
  const markdown = redactChangelogEmails(typeof row.markdown === "string" ? row.markdown : "");
  const message = redactChangelogEmails(typeof row.message === "string" ? row.message : "");
  const slice = articleDiffSlicer(markdown);
  const change = (rawDiff: string): PublicChangelogEntryChange => {
    const diff = truncatePublicChangelogDiff(rawDiff);
    return { ...describeChange(message, diff), hasDiff: diff.trim().length > 0 };
  };
  const seen = new Set<string>();
  return {
    id: row.entryId,
    createdAt: row.createdAt,
    submittedBy: publicChangelogSubmitter(row.submittedBy),
    articles,
    wholeEntry: change(articles.length === 1 ? slice(articles[0]) : markdown),
    byArticle: articles.map((article) => {
      if (seen.has(article.slug)) return null;
      seen.add(article.slug);
      return change(slice(article));
    }),
  };
}

export function assemblePublicChangelogSummaries(
  entries: readonly (PublicChangelogEntrySummary | null)[],
  subjectSlug: string | null,
): PublicChangelogSummary[] {
  const changes: PublicChangelogSummary[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const change = subjectSlug
      ? entry.byArticle[entry.articles.findIndex((article) => article.slug === subjectSlug)]
      : entry.wholeEntry;
    if (!change) continue;
    const { hasDiff, ...description } = change;
    changes.push({
      id: entry.id,
      createdAt: entry.createdAt,
      ...description,
      hasDiff,
      articles: entry.articles,
      subjectSlug,
      submittedBy: entry.submittedBy,
    });
  }
  return mergeSourceChurn(changes);
}
