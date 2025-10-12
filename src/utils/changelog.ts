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

const formatValue = (value: unknown) => {
  if (value === undefined) {
    return "∅";
  }
  if (typeof value === "string") {
    return value.replace(/`/g, "\`");
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

const formatDiffEntry = ({ path, before, after }: DiffEntry) => {
  const label = path.length > 0 ? path : "record";
  if (before === undefined && after !== undefined) {
    return `- \`${label}\`: added \`${formatValue(after)}\``;
  }
  if (before !== undefined && after === undefined) {
    return `- \`${label}\`: removed (was \`${formatValue(before)}\`)`;
  }
  return `- \`${label}\`: \`${formatValue(before)}\` → \`${formatValue(after)}\``;
};

export const buildArticleChangelog = (heading: string, original: unknown, updated: unknown) => {
  const entries: DiffEntry[] = [];
  collectDiff(original, updated, [], entries);

  if (entries.length === 0) {
    const body = !original && !updated ? "- No data available for comparison." : "- No saved differences versus source dataset.";
    return {
      markdown: `### ${heading}\n\n${body}\n`,
      hasChanges: false,
    };
  }

  const formatted = entries.map((entry) => formatDiffEntry(entry)).join("\n");
  return {
    markdown: `### ${heading}\n\n${formatted}\n`,
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
