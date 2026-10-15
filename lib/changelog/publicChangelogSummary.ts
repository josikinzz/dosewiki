import {
  describeChange,
  mergeSourceChurn,
  sliceArticleDiff,
  type ArticleRecentChange,
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

export function projectPublicChangelogSummaries(
  rows: readonly PublicChangelogSummaryInput[],
  subjectSlug: string | null,
): PublicChangelogSummary[] {
  const changes: PublicChangelogSummary[] = [];
  for (const row of rows) {
    if (typeof row.entryId !== "string" || typeof row.createdAt !== "string") continue;
    const articles = row.articles.map(({ id, title, slug }) => ({ id, title, slug }));
    const article = subjectSlug
      ? articles.find((candidate) => candidate.slug === subjectSlug)
      : articles[0];
    if (subjectSlug && !article) continue;
    const markdown = redactChangelogEmails(typeof row.markdown === "string" ? row.markdown : "");
    const diff = truncatePublicChangelogDiff(
      article && (subjectSlug || articles.length === 1)
        ? sliceArticleDiff(markdown, article)
        : markdown,
    );
    changes.push({
      id: row.entryId,
      createdAt: row.createdAt,
      ...describeChange(redactChangelogEmails(typeof row.message === "string" ? row.message : ""), diff),
      hasDiff: diff.trim().length > 0,
      articles,
      subjectSlug,
      submittedBy: publicChangelogSubmitter(row.submittedBy),
    });
  }
  return mergeSourceChurn(changes);
}
