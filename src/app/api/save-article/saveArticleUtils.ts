import type { ManualCategoryDefinition } from "@/data/builders/manualIndexLoader";
import { slugify } from "@/utils/slug";
import { deriveSubmittedBy } from "@server/changelog/submitterStamp";


export type ChangelogArticle = {
  id: number;
  title: string;
  slug: string;
};

export type ChangelogPayload = {
  markdown: string;
  articles: ChangelogArticle[];
};

export type IndexLayoutPayload = {
  type: "psychoactive" | "chemical" | "mechanism";
  version: number;
  categories: ManualCategoryDefinition[];
  expected?: unknown;
  expectedRevision?: number;
  operationId?: string;
};

export type ArticleDebugSummary = {
  target: string;
  id: number | null;
  title: string;
  requestedSlug: string | null;
  fallbackSlug: string | null;
};

export type ArticleSnapshot = {
  id: number | null;
  title: string;
  slug: string | null;
};

export type ArticleVerification = {
  target: string;
  found: boolean;
  previousSlug: string | null;
  requestedSlug: string | null;
  storedSlug: string | null;
  storedTitle: string | null;
  titleMatches: boolean;
  slugMatches: boolean;
};

export type ArticleWriteOutcome = {
  target: string;
  action: "created" | "updated" | "skipped";
  title: string;
  requestedSlug: string | null;
  fallbackSlug: string | null;
  canonicalSlug: string | null;
  previous: ArticleSnapshot | null;
  next: ArticleSnapshot | null;
  affectedPaths: string[];
  publicRevision?: string;
  publicationDependency?: "detail" | "content" | "membership";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseChangelogPayload(value: unknown): ChangelogPayload | null {
  if (!isRecord(value) || typeof value.markdown !== "string" || !Array.isArray(value.articles)) {
    return null;
  }

  const articles = value.articles.filter(
    (entry): entry is ChangelogArticle =>
      isRecord(entry) &&
      typeof entry.id === "number" &&
      typeof entry.title === "string" &&
      typeof entry.slug === "string",
  );

  if (articles.length === 0 && value.markdown.trim().length === 0) {
    return null;
  }

  return {
    markdown: value.markdown,
    articles,
  };
}

export function parseIndexLayoutPayloads(value: unknown): IndexLayoutPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is IndexLayoutPayload => {
    if (!isRecord(entry)) {
      return false;
    }

    const isSupportedType =
      entry.type === "psychoactive" || entry.type === "chemical" || entry.type === "mechanism";

    return isSupportedType && typeof entry.version === "number" && Array.isArray(entry.categories);
  });
}

export { deriveSubmittedBy };

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function summarizeArticleForDebug(article: unknown, index: number): ArticleDebugSummary {
  const record = isRecord(article) ? article : null;
  const id = typeof record?.id === "number" ? record.id : null;
  const title = normalizeString(record?.title) ?? `Article ${index + 1}`;
  const requestedSlug = normalizeString(record?.slug);
  const fallbackSlug = requestedSlug ?? (slugify(title) || null);
  const target = id !== null ? `id:${id}` : fallbackSlug ? `slug:${fallbackSlug}` : `index:${index}`;

  return {
    target,
    id,
    title,
    requestedSlug,
    fallbackSlug,
  };
}

const DATA_ARTICLE_MUTATION_FIELDS = [
  "id",
  "title",
  "slug",
  "priority",
  "index_categories",
  "identification",
  "classification",
  "summary",
  "dosage",
  "duration",
  "subjective_effects",
  "comparisons",
  "pharmacology",
  "interactions",
  "reagent_testing",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
  "editorial_review",
  "references",
  "source_citations",
  "citations",
] as const;

const DATA_ARTICLE_MUTATION_FIELD_SET = new Set<string>(DATA_ARTICLE_MUTATION_FIELDS);

export function sanitizeArticleForDataMutation(article: unknown): unknown {
  if (!isRecord(article)) {
    return article;
  }

  const articlePayload: Record<string, unknown> = {};
  for (const key of DATA_ARTICLE_MUTATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(article, key)) {
      articlePayload[key] = article[key];
    }
  }

  return articlePayload;
}

export function countFieldsStrippedForDataMutation(article: unknown): number {
  if (!isRecord(article)) {
    return 0;
  }

  return Object.keys(article).filter((key) => !DATA_ARTICLE_MUTATION_FIELD_SET.has(key)).length;
}

export function toArticleSnapshot(
  article: { id?: number | null; title?: string; slug?: string | null } | null,
): ArticleSnapshot | null {
  if (!article) {
    return null;
  }

  return {
    id: typeof article.id === "number" ? article.id : null,
    title: article.title ?? "",
    slug: article.slug ?? null,
  };
}

export function buildArticleVerification(
  summary: ArticleDebugSummary,
  previous: ArticleSnapshot | null,
  stored: ArticleSnapshot | null,
): ArticleVerification {
  const requestedSlug = summary.requestedSlug ?? summary.fallbackSlug;
  const storedSlug = stored?.slug ?? null;
  const storedTitle = stored?.title ?? null;

  return {
    target: summary.target,
    found: stored !== null,
    previousSlug: previous?.slug ?? null,
    requestedSlug,
    storedSlug,
    storedTitle,
    titleMatches: storedTitle === summary.title,
    slugMatches: requestedSlug === null ? storedSlug !== null : storedSlug === requestedSlug,
  };
}

export function buildArticlePathsForRevalidation(
  summaries: ArticleDebugSummary[],
  previousByTarget: Map<string, ArticleSnapshot | null>,
  verification: ArticleVerification[],
): string[] {
  const paths = new Set<string>(["/substances"]);

  for (const entry of summaries) {
    const previousSlug = previousByTarget.get(entry.target)?.slug ?? null;
    const requestedSlug = entry.requestedSlug ?? entry.fallbackSlug;

    if (previousSlug) {
      paths.add(`/${previousSlug}`);
    }

    if (requestedSlug) {
      paths.add(`/${requestedSlug}`);
    }
  }

  for (const entry of verification) {
    if (entry.storedSlug) {
      paths.add(`/${entry.storedSlug}`);
    }
  }

  return Array.from(paths).sort((left, right) => left.localeCompare(right));
}

export function buildArticleVerificationFromWriteOutcome(outcome: ArticleWriteOutcome): ArticleVerification {
  const requestedSlug = outcome.canonicalSlug ?? outcome.requestedSlug ?? outcome.fallbackSlug;
  const storedSlug = outcome.next?.slug ?? null;
  const storedTitle = outcome.next?.title ?? null;

  return {
    target: outcome.target,
    found: outcome.next !== null,
    previousSlug: outcome.previous?.slug ?? null,
    requestedSlug,
    storedSlug,
    storedTitle,
    titleMatches: storedTitle === outcome.title,
    slugMatches: requestedSlug === null ? storedSlug !== null : storedSlug === requestedSlug,
  };
}

export function buildArticlePathsFromWriteOutcomes(outcomes: ArticleWriteOutcome[]): string[] {
  const paths = new Set<string>();

  for (const outcome of outcomes) {
    for (const path of outcome.affectedPaths) {
      paths.add(path);
    }
  }

  return Array.from(paths).sort((left, right) => left.localeCompare(right));
}
