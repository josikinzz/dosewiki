import { validateArticleForIngestion } from "./validators";

type StoredSubstance = {
  _id: unknown;
  id?: number | null;
  title?: string;
  slug?: string | null;
};

type SubstanceArticleLike = {
  id: number | null;
  title: string;
  slug?: string;
};

type SubstanceDb = {
  query: (table: "substanceIndex") => {
    withIndex: (
      indexName: "by_article_id" | "by_slug",
      callback: (query: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => { first: () => Promise<StoredSubstance | null> };
  };
  patch: (id: unknown, value: Record<string, unknown>) => Promise<void>;
  insert: (table: "substanceIndex", value: Record<string, unknown>) => Promise<unknown>;
};

export type SubstanceIdentitySnapshot = {
  id: number | null;
  title: string;
  slug: string | null;
};

export type SubstanceIngestionOutcome = {
  target: string;
  action: "created" | "updated" | "skipped";
  convexId: unknown | null;
  articleId: number | null;
  title: string;
  requestedSlug: string | null;
  fallbackSlug: string | null;
  canonicalSlug: string | null;
  previous: SubstanceIdentitySnapshot | null;
  next: SubstanceIdentitySnapshot | null;
  validationErrors: string[];
  error: string | null;
  affectedPaths: string[];
};

export type SubstanceIngestionResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  outcomes: SubstanceIngestionOutcome[];
  affectedPaths: string[];
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toSubstanceSnapshot(article: StoredSubstance | SubstanceArticleLike | null): SubstanceIdentitySnapshot | null {
  if (!article) {
    return null;
  }

  return {
    id: typeof article.id === "number" ? article.id : null,
    title: typeof article.title === "string" ? article.title : "",
    slug: typeof article.slug === "string" ? article.slug : null,
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function summarizeSubstanceWriteTarget(article: unknown, index = 0) {
  const record = typeof article === "object" && article !== null ? (article as Record<string, unknown>) : null;
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
    canonicalSlug: requestedSlug ?? fallbackSlug,
  };
}

function pathsForOutcome(outcome: Pick<SubstanceIngestionOutcome, "canonicalSlug" | "previous" | "next">): string[] {
  const paths = new Set<string>(["/substances"]);
  const previousSlug = outcome.previous?.slug ?? null;
  const nextSlug = outcome.next?.slug ?? outcome.canonicalSlug;

  if (previousSlug) {
    paths.add(`/${previousSlug}`);
  }

  if (outcome.canonicalSlug) {
    paths.add(`/${outcome.canonicalSlug}`);
  }

  if (nextSlug) {
    paths.add(`/${nextSlug}`);
  }

  return Array.from(paths).sort((left, right) => left.localeCompare(right));
}

function buildSkippedOutcome({
  article,
  index,
  validationErrors,
  error,
}: {
  article: unknown;
  index: number;
  validationErrors: string[];
  error: string;
}): SubstanceIngestionOutcome {
  const summary = summarizeSubstanceWriteTarget(article, index);

  return {
    target: summary.target,
    action: "skipped",
    convexId: null,
    articleId: summary.id,
    title: summary.title,
    requestedSlug: summary.requestedSlug,
    fallbackSlug: summary.fallbackSlug,
    canonicalSlug: summary.canonicalSlug,
    previous: null,
    next: null,
    validationErrors,
    error,
    affectedPaths: [],
  };
}

async function findByArticleId(db: SubstanceDb, id: number) {
  return db
    .query("substanceIndex")
    .withIndex("by_article_id", (query) => query.eq("id", id))
    .first();
}

async function findBySlug(db: SubstanceDb, slug: string) {
  return db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", slug))
    .first();
}

function sameStoredDocument(left: StoredSubstance | null, right: StoredSubstance | null): boolean {
  return left !== null && right !== null && left._id === right._id;
}

export async function ingestSubstanceArticle({
  db,
  article,
  index = 0,
}: {
  db: SubstanceDb;
  article: SubstanceArticleLike & Record<string, unknown>;
  index?: number;
}): Promise<SubstanceIngestionOutcome> {
  const validation = validateArticleForIngestion(article);
  if (validation.ok === false) {
    return buildSkippedOutcome({
      article,
      index,
      validationErrors: validation.issues,
      error: `Article ${article.title}: Invalid structure: ${validation.message}`,
    });
  }

  const summary = summarizeSubstanceWriteTarget(article, index);
  const articleWithSlug = {
    ...article,
    slug: summary.canonicalSlug ?? slugify(article.title),
  };
  const canonicalSlug = articleWithSlug.slug;
  const existingById = articleWithSlug.id !== null ? await findByArticleId(db, articleWithSlug.id) : null;
  const existingBySlug = canonicalSlug ? await findBySlug(db, canonicalSlug) : null;

  if (existingById && existingBySlug && !sameStoredDocument(existingById, existingBySlug)) {
    const error = `Article ${article.title}: Slug "${canonicalSlug}" already belongs to "${existingBySlug.title ?? "another article"}".`;
    return {
      target: summary.target,
      action: "skipped",
      convexId: existingById._id,
      articleId: articleWithSlug.id,
      title: article.title,
      requestedSlug: summary.requestedSlug,
      fallbackSlug: summary.fallbackSlug,
      canonicalSlug,
      previous: toSubstanceSnapshot(existingById),
      next: null,
      validationErrors: [],
      error,
      affectedPaths: pathsForOutcome({
        canonicalSlug,
        previous: toSubstanceSnapshot(existingById),
        next: toSubstanceSnapshot(existingBySlug),
      }),
    };
  }

  const existing = existingById ?? existingBySlug;
  const previous = toSubstanceSnapshot(existing);
  const next = toSubstanceSnapshot(articleWithSlug);

  if (existing) {
    await db.patch(existing._id, articleWithSlug);
    return {
      target: summary.target,
      action: "updated",
      convexId: existing._id,
      articleId: articleWithSlug.id,
      title: article.title,
      requestedSlug: summary.requestedSlug,
      fallbackSlug: summary.fallbackSlug,
      canonicalSlug,
      previous,
      next,
      validationErrors: [],
      error: null,
      affectedPaths: pathsForOutcome({ canonicalSlug, previous, next }),
    };
  }

  const convexId = await db.insert("substanceIndex", articleWithSlug);
  return {
    target: summary.target,
    action: "created",
    convexId,
    articleId: articleWithSlug.id,
    title: article.title,
    requestedSlug: summary.requestedSlug,
    fallbackSlug: summary.fallbackSlug,
    canonicalSlug,
    previous: null,
    next,
    validationErrors: [],
    error: null,
    affectedPaths: pathsForOutcome({ canonicalSlug, previous: null, next }),
  };
}

export async function ingestSubstanceArticles({
  db,
  articles,
}: {
  db: SubstanceDb;
  articles: Array<SubstanceArticleLike & Record<string, unknown>>;
}): Promise<SubstanceIngestionResult> {
  const outcomes: SubstanceIngestionOutcome[] = [];

  for (const [index, article] of articles.entries()) {
    try {
      outcomes.push(await ingestSubstanceArticle({ db, article, index }));
    } catch (error) {
      outcomes.push(
        buildSkippedOutcome({
          article,
          index,
          validationErrors: [],
          error: `Substance ${article.title}: ${error}`,
        }),
      );
    }
  }

  const affectedPaths = new Set<string>();
  for (const outcome of outcomes) {
    for (const path of outcome.affectedPaths) {
      affectedPaths.add(path);
    }
  }

  return {
    created: outcomes.filter((outcome) => outcome.action === "created").length,
    updated: outcomes.filter((outcome) => outcome.action === "updated").length,
    skipped: outcomes.filter((outcome) => outcome.action === "skipped").length,
    errors: outcomes.flatMap((outcome) => (outcome.error ? [outcome.error] : [])),
    outcomes,
    affectedPaths: Array.from(affectedPaths).sort((left, right) => left.localeCompare(right)),
  };
}

