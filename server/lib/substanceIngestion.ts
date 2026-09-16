import { stableStringify } from "../../lib/proposals/contentHash";
import { projectPublicArticle } from "../../src/data/projections/substanceReadProjections";
import {
  classifySubstancePublicationDependency,
  type SubstancePublicationDependency,
} from "../../src/data/projections/substancePublicationDependencies";
import type { SubstanceArticleRecord } from "../../src/data/projections/substanceProjectionCore";
import { mergeReferenceCollections } from "../../lib/citations/referenceIdentity.mjs";
import type { Reference } from "../../src/schema/substance/shared";
import { slugify } from "../../src/utils/slug";
import { validateArticleForIngestion } from "./validators";

// Re-exported so other server modules keep a single import site for the
// canonical substance slug algorithm (src/utils/slug.ts).
export { slugify };

export type StoredSubstance = {
  _id: unknown;
  id?: number | null;
  title?: string;
  slug?: string | null;
  references?: Reference[];
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
  dataId: unknown | null;
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
  publicRevision?: string;
  publicationDependency?: SubstancePublicationDependency;
};

export type SubstanceIngestionResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  outcomes: SubstanceIngestionOutcome[];
  affectedPaths: string[];
};

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
  error: string | null;
}): SubstanceIngestionOutcome {
  const summary = summarizeSubstanceWriteTarget(article, index);

  return {
    target: summary.target,
    action: "skipped",
    dataId: null,
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

export function remapReferenceIds(value: unknown, remap: Map<string, string>, field = ""): unknown {
  if (typeof value === "string") {
    if (field === "referenceId") return remap.get(value) ?? value;
    return value.replace(/\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g, (marker, id) => (
      `[cite:${remap.get(id) ?? id}]`
    ));
  }
  if (Array.isArray(value)) {
    if (field === "reference_ids" || field === "referenceIds") {
      return value.map((item) => typeof item === "string" ? remap.get(item) ?? item : item);
    }
    return value.map((item) => remapReferenceIds(item, remap));
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      key === "references" ? item : remapReferenceIds(item, remap, key),
    ]),
  );
}

export function mergeArticleReferenceMetadataForReplacement<T extends Record<string, unknown>>(
  article: T,
  storedReferences: Reference[] = [],
) {
  const incomingReferences = (Array.isArray(article.references) ? article.references : []) as Reference[];
  // Replacement writes keep deletion semantics: omitted stored references are
  // deleted. Stored entries retain canonical marker ids and enrich incoming
  // records, while explicit fetched/inspected provenance may replace lower-rank
  // scalar metadata.
  const merged = mergeReferenceCollections(storedReferences, incomingReferences, {
    allowTrustedScalarOverride: true,
    retainExistingUnmatched: false,
  });
  const remappedArticle = remapReferenceIds(article, merged.remap) as T;
  return {
    article: { ...remappedArticle, references: merged.references },
    remap: merged.remap,
  };
}

export function prepareSubstanceReplacementArticles({
  articles,
  existing,
}: {
  articles: unknown[];
  existing: StoredSubstance[];
}) {
  const existingById = new Map<number, StoredSubstance[]>();
  const existingBySlug = new Map<string, StoredSubstance[]>();
  for (const article of existing) {
    if (typeof article.id === "number") {
      const matches = existingById.get(article.id) ?? [];
      matches.push(article);
      existingById.set(article.id, matches);
    }
    if (typeof article.slug === "string" && article.slug) {
      const matches = existingBySlug.get(article.slug) ?? [];
      matches.push(article);
      existingBySlug.set(article.slug, matches);
    }
  }

  const duplicateId = [...existingById.entries()].find(([, matches]) => matches.length > 1);
  if (duplicateId) {
    throw new Error(`Cannot prepare substance replacement: stored article id ${duplicateId[0]} is duplicated.`);
  }
  const duplicateSlug = [...existingBySlug.entries()].find(([, matches]) => matches.length > 1);
  if (duplicateSlug) {
    throw new Error(`Cannot prepare substance replacement: stored article slug "${duplicateSlug[0]}" is duplicated.`);
  }

  const skipped: Array<{ title: string; message: string }> = [];
  const candidates: Array<{
    article: Record<string, unknown> & SubstanceArticleLike & { slug: string };
    explicitSlug: string | null;
    title: string;
  }> = [];

  for (const rawArticle of articles) {
    const validation = validateArticleForIngestion(rawArticle);
    const rawRecord = rawArticle && typeof rawArticle === "object"
      ? rawArticle as Record<string, unknown>
      : {};
    const title = typeof rawRecord.title === "string" ? rawRecord.title : "Unknown article";
    if (validation.ok === false) {
      skipped.push({ title, message: validation.message });
      continue;
    }

    const explicitSlug = normalizeString(rawRecord.slug);
    candidates.push({
      article: {
        ...validation.article,
        id: validation.article.id ?? null,
        slug: explicitSlug ?? slugify(validation.article.title),
      },
      explicitSlug,
      title,
    });
  }

  const seenIncomingIds = new Set<number>();
  const seenExplicitSlugs = new Set<string>();
  const seenEffectiveSlugs = new Set<string>();
  for (const candidate of candidates) {
    const { id, slug } = candidate.article;
    if (typeof id === "number") {
      if (seenIncomingIds.has(id)) {
        throw new Error(`Cannot prepare substance replacement: incoming article id ${id} is duplicated.`);
      }
      seenIncomingIds.add(id);
    }
    if (candidate.explicitSlug) {
      if (seenExplicitSlugs.has(candidate.explicitSlug)) {
        throw new Error(
          `Cannot prepare substance replacement: incoming explicit slug "${candidate.explicitSlug}" is duplicated.`,
        );
      }
      seenExplicitSlugs.add(candidate.explicitSlug);
    }
    if (seenEffectiveSlugs.has(slug)) {
      throw new Error(`Cannot prepare substance replacement: incoming effective slug "${slug}" is duplicated.`);
    }
    seenEffectiveSlugs.add(slug);
  }

  const prepared: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    const articleWithSlug = candidate.article;
    const storedById = typeof articleWithSlug.id === "number"
      ? existingById.get(articleWithSlug.id)?.[0]
      : undefined;
    const storedBySlug = existingBySlug.get(articleWithSlug.slug)?.[0];
    if (storedById && storedBySlug && !sameStoredDocument(storedById, storedBySlug)) {
      throw new Error(
        `Cannot prepare substance replacement for "${candidate.title}": id ${articleWithSlug.id} and slug "${articleWithSlug.slug}" resolve to different stored articles.`,
      );
    }
    const stored = storedById ?? storedBySlug;
    prepared.push(mergeArticleReferenceMetadataForReplacement(
      articleWithSlug,
      Array.isArray(stored?.references) ? stored.references : [],
    ).article);
  }

  return { prepared, skipped };
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

  const articleForStorage = {
    ...validation.article,
    id: validation.article.id ?? null,
  };
  const summary = summarizeSubstanceWriteTarget(articleForStorage, index);
  const articleWithSlug = {
    ...articleForStorage,
    slug: summary.canonicalSlug ?? slugify(articleForStorage.title),
  };
  const canonicalSlug = articleWithSlug.slug;
  const existingById = articleWithSlug.id !== null ? await findByArticleId(db, articleWithSlug.id) : null;
  const existingBySlug = canonicalSlug ? await findBySlug(db, canonicalSlug) : null;

  if (existingById && existingBySlug && !sameStoredDocument(existingById, existingBySlug)) {
    const error = `Article ${articleForStorage.title}: Slug "${canonicalSlug}" already belongs to "${existingBySlug.title ?? "another article"}".`;
    return {
      target: summary.target,
      action: "skipped",
      dataId: existingById._id,
      articleId: articleWithSlug.id,
      title: articleForStorage.title,
      requestedSlug: summary.requestedSlug,
      fallbackSlug: summary.fallbackSlug,
      canonicalSlug,
      previous: toSubstanceSnapshot(existingById),
      next: null,
      validationErrors: [],
      error,
      affectedPaths: [],
    };
  }

  const existing = existingById ?? existingBySlug;
  const articleWithMergedReferences = mergeArticleReferenceMetadataForReplacement(
    articleWithSlug,
    Array.isArray(existing?.references) ? existing.references : [],
  ).article;
  const previous = toSubstanceSnapshot(existing);
  const next = toSubstanceSnapshot(articleWithMergedReferences);
  // Database reads retain complete documents; StoredSubstance names only identity fields.
  const previousDocument = existing as unknown as SubstanceArticleRecord | null;
  const publicationDependency = classifySubstancePublicationDependency(
    previousDocument,
    articleWithMergedReferences as SubstanceArticleRecord,
  );
  if (existing && Object.entries(articleWithMergedReferences).every(([key, value]) =>
    stableStringify(existing[key]) === stableStringify(value))) {
    return {
      ...buildSkippedOutcome({ article, index, validationErrors: [], error: null }),
      dataId: existing._id, previous, next,
    };
  }
  const publicRevision = projectPublicArticle(
    { ...existing, ...articleWithMergedReferences },
  ).publicRevision;

  if (existing) {
    await db.patch(existing._id, articleWithMergedReferences);
    return {
      target: summary.target,
      action: "updated",
      dataId: existing._id,
      articleId: articleWithSlug.id,
      title: articleForStorage.title,
      requestedSlug: summary.requestedSlug,
      fallbackSlug: summary.fallbackSlug,
      canonicalSlug,
      previous,
      next,
      publicRevision,
      publicationDependency,
      validationErrors: [],
      error: null,
      affectedPaths: pathsForOutcome({ canonicalSlug, previous, next }),
    };
  }

  const dataId = await db.insert("substanceIndex", articleWithMergedReferences);
  return {
    target: summary.target,
    action: "created",
    dataId,
    articleId: articleWithSlug.id,
    title: articleForStorage.title,
    requestedSlug: summary.requestedSlug,
    fallbackSlug: summary.fallbackSlug,
    canonicalSlug,
    previous: null,
    next,
    publicRevision,
    publicationDependency,
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

