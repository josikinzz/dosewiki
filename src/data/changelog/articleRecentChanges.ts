import type { ChangeLogArticleSummary } from "./changeLog";

/**
 * One human edit to one article, projected for the public article page's
 * "Recent changes" disclosure. `diff` is already sliced to this article and
 * capped; `contributor` is resolved from the contributor directory on the
 * server so the client never sees the raw submitter stamp when a profile
 * exists.
 */
export type ArticleRecentChange = {
  id: string;
  /** ISO timestamp of the save. */
  createdAt: string;
  /** The save message, e.g. "Inline edit — Dosage / Threshold". */
  message: string;
  contributor: {
    name: string;
    href: string | null;
    avatarUrl: string | null;
  } | null;
  /** Unified-diff-style lines for this article only; empty when none stored. */
  diff: string;
  /** How many articles the same save touched, including this one. */
  articleCount: number;
};

const SECTION_HEADING = /^# (.+)$/;

/**
 * Bulk Dev-editor saves store one diff for every article they touched, one
 * `# <Title> · #<id>` section per article (`formatArticleLabel`); direct edits
 * store a single `# <Title>` section. Return only this article's section body.
 *
 * A diff with no section headings is returned whole. A diff whose headings
 * never match falls back to its only section when it has exactly one, and to
 * nothing otherwise: showing another article's changes here would be wrong.
 */
export function sliceArticleDiff(markdown: string, article: ChangeLogArticleSummary): string {
  const lines = markdown.split("\n");
  const sections: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    const heading = SECTION_HEADING.exec(line);
    if (heading) {
      current = { heading: heading[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  if (sections.length === 0) {
    return markdown.trim();
  }

  const title = article.title.trim().toLowerCase();
  const idSuffix = `#${article.id}`;
  const match =
    sections.find((section) => {
      const heading = section.heading.toLowerCase();
      return heading === title || heading.endsWith(`· ${idSuffix}`) || heading === idSuffix;
    }) ?? (sections.length === 1 ? sections[0] : null);

  if (!match) {
    return "";
  }

  const body = match.body.join("\n").trim();
  return body === "No differences detected." || body === "No data available for comparison."
    ? ""
    : body;
}
