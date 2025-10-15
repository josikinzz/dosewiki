import { createPatch } from "diff";
import type { ChangeLogArticleSummary } from "../data/changeLog";

export type DiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const joinPath = (segments: string[]) =>
  segments.reduce((acc, segment) => {
    if (segment.startsWith("[")) {
      return `${acc}${segment}`;
    }
    return acc.length > 0 ? `${acc}.${segment}` : segment;
  }, "");

const valuesEqual = (a: unknown, b: unknown) => Object.is(a, b);

export const collectDiff = (original: unknown, updated: unknown, segments: string[], acc: DiffEntry[]) => {
  if (original === undefined && updated === undefined) {
    return;
  }

  if (Array.isArray(original) && Array.isArray(updated)) {
    const maxLength = Math.max(original.length, updated.length);
    for (let index = 0; index < maxLength; index += 1) {
      collectDiff(
        index < original.length ? original[index] : undefined,
        index < updated.length ? updated[index] : undefined,
        [...segments, `[${index}]`],
        acc,
      );
    }
    return;
  }

  if (isRecord(original) && isRecord(updated)) {
    const keys = new Set([...Object.keys(original), ...Object.keys(updated)]);
    keys.forEach((key) => {
      collectDiff(original[key], updated[key], [...segments, key], acc);
    });
    return;
  }

  if (Array.isArray(original) || Array.isArray(updated) || isRecord(original) || isRecord(updated)) {
    if (!valuesEqual(original, updated)) {
      acc.push({ path: joinPath(segments), before: original, after: updated });
    }
    return;
  }

  if (valuesEqual(original, updated)) {
    return;
  }

  acc.push({ path: joinPath(segments), before: original, after: updated });
};
const ensureTrailingNewline = (value: string) => (value.endsWith("\n") ? value : `${value}\n`);

const stringifyForDiff = (value: unknown) => {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return ensureTrailingNewline(value);
  }

  try {
    return ensureTrailingNewline(JSON.stringify(value, null, 2));
  } catch {
    return ensureTrailingNewline(String(value));
  }
};

const toDiffFileName = (heading: string) => {
  const normalized = heading.trim().toLowerCase();
  if (!normalized) {
    return "article";
  }

  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "article";
};

export const buildArticleChangelog = (heading: string, original: unknown, updated: unknown) => {
  const entries: DiffEntry[] = [];
  collectDiff(original, updated, [], entries);
  const hasChanges = entries.length > 0;

  const header = `# ${heading}\n`;

  if (!hasChanges) {
    const noDiffMessage = !original && !updated ? "No data available for comparison." : "No differences detected.";
    return {
      markdown: `${header}\n${noDiffMessage}\n`,
      hasChanges: false,
    };
  }

  const beforeText = stringifyForDiff(original);
  const afterText = stringifyForDiff(updated);
  const patch = createPatch(`${toDiffFileName(heading)}.json`, beforeText, afterText, "", "", { context: 0 });
  const trimmedPatch = patch.trimEnd();
  const meaningfulLines = trimmedPatch
    .split("\n")
    .filter((line) => {
      if (line.length === 0) {
        return false;
      }
      if (line.startsWith("Index:")) {
        return false;
      }
      if (line.startsWith("====")) {
        return false;
      }
      if (line.startsWith("---") || line.startsWith("+++")) {
        return false;
      }
      if (line.startsWith("@@")) {
        return false;
      }
      return line.startsWith("+") || line.startsWith("-");
    });
  const body = meaningfulLines.join("\n");

  return {
    markdown: `${header}\n${body.length > 0 ? body : "No differences detected."}\n`,
    hasChanges: true,
  };
};

export type DatasetChangelogSection = {
  index: number;
  heading: string;
  markdown: string;
};

export type DatasetChangelogResult = {
  markdown: string;
  articles: ChangeLogArticleSummary[];
  sections: DatasetChangelogSection[];
};

export interface BuildDatasetChangelogOptions<Article> {
  articles: Article[];
  getOriginalArticle: (index: number) => Article | undefined;
  formatHeading: (article: Article | undefined, index: number) => string;
  summarizeArticle: (article: Article | undefined, index: number) => ChangeLogArticleSummary | null;
}

export const buildDatasetChangelog = <Article,>(options: BuildDatasetChangelogOptions<Article>): DatasetChangelogResult => {
  const sections: DatasetChangelogSection[] = [];
  const summaries: ChangeLogArticleSummary[] = [];

  options.articles.forEach((article, index) => {
    const original = options.getOriginalArticle(index);
    const heading = options.formatHeading(article, index);
    const { markdown, hasChanges } = buildArticleChangelog(heading, original, article);

    if (hasChanges) {
      sections.push({ index, heading, markdown });
      const summary = options.summarizeArticle(article, index) ?? options.summarizeArticle(original, index);
      if (summary) {
        summaries.push(summary);
      }
    }
  });

  const markdown = sections.map((section) => section.markdown.trimEnd()).join("\n\n");

  return {
    markdown,
    articles: summaries,
    sections,
  };
};
