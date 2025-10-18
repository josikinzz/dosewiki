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
  originalArticles: Article[];
  getArticleKey?: (article: Article | undefined, index: number) => string | number | null;
  formatHeading: (article: Article | undefined, index: number) => string;
  summarizeArticle: (article: Article | undefined, index: number) => ChangeLogArticleSummary | null;
}

export const buildDatasetChangelog = <Article,>(options: BuildDatasetChangelogOptions<Article>): DatasetChangelogResult => {
  const sections: DatasetChangelogSection[] = [];
  const summaryBySlug = new Map<string, ChangeLogArticleSummary>();

  const getArticleKey =
    options.getArticleKey ??
    ((article: Article | undefined) => {
      if (!article || typeof article !== "object") {
        return null;
      }

      const candidate = (article as { id?: unknown }).id;
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
      return null;
    });

  const toKey = (article: Article | undefined, index: number, source: "original" | "updated") => {
    const key = getArticleKey(article, index);
    if (key !== null && key !== undefined) {
      return `id:${String(key)}`;
    }
    return `${source}:${index}`;
  };

  const originalMap = new Map<
    string,
    {
      article: Article | undefined;
      index: number;
    }
  >();

  options.originalArticles.forEach((article, index) => {
    const key = toKey(article, index, "original");
    originalMap.set(key, { article, index });
  });

  const updatedMap = new Map<
    string,
    {
      article: Article | undefined;
      index: number;
    }
  >();

  options.articles.forEach((article, index) => {
    const key = toKey(article, index, "updated");
    updatedMap.set(key, { article, index });
  });

  const orderedKeys: string[] = [];
  const seenKeys = new Set<string>();

  options.articles.forEach((article, index) => {
    const key = toKey(article, index, "updated");
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      orderedKeys.push(key);
    }
  });

  options.originalArticles.forEach((article, index) => {
    const key = toKey(article, index, "original");
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      orderedKeys.push(key);
    }
  });

  orderedKeys.forEach((key) => {
    const updated = updatedMap.get(key);
    const original = originalMap.get(key);

    const updatedArticle = updated?.article;
    const originalArticle = original?.article;
    const headingIndex = updated?.index ?? original?.index ?? 0;
    const headingArticle = updatedArticle ?? originalArticle;

    const heading = options.formatHeading(headingArticle, headingIndex);
    const { markdown, hasChanges } = buildArticleChangelog(heading, originalArticle, updatedArticle);

    if (!hasChanges) {
      return;
    }

    sections.push({ index: headingIndex, heading, markdown });

    const summary =
      options.summarizeArticle(updatedArticle, updated?.index ?? headingIndex) ??
      options.summarizeArticle(originalArticle, original?.index ?? headingIndex);

    if (summary) {
      const summaryKey = summary.slug || String(summary.id);
      if (!summaryBySlug.has(summaryKey)) {
        summaryBySlug.set(summaryKey, summary);
      }
    }
  });

  const markdown = sections.map((section) => section.markdown.trimEnd()).join("\n\n");

  return {
    markdown,
    articles: [...summaryBySlug.values()],
    sections,
  };
};
