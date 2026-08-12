import "server-only";

import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { GalleryReplication, ReplicationWithUrl } from "../../src/types/replications";
import {
  priorityScore,
  trimExcerpt,
  type AboutConfigRecord,
  type IndexLayoutRecord,
  type IndexLayoutType,
  type PublicCategoryLayout,
  type PublicEffectArticle,
  type PublicEffectIndexArticle,
  type PublicEffectPreview,
  type PublicMechanismRouteInput,
  type PublicSubstanceLibraryRecord,
  type PublicSubstanceLookupEntry,
  type PublicSubstancePreview,
  type PublicSubstanceRecord,
  type SubstanceRecord,
  type SubjectiveEffectDetailRecord,
  type SubjectiveEffectRecord,
  type TripReportDetailRecord,
  type TripReportRecord,
} from "./publicData.shared";
import {
  type PublicSubstanceArticleRecord,
  parsePublicSubstanceLibraryInputRecords,
  parsePublicSubstanceRecord,
  parsePublicSubstanceRecords,
} from "./publicData.substanceContract";
import { queryConvex } from "./serverClient";
import { normalizeVCodeContent } from "../../src/features/effects/vcode/normalize";
import {
  normalizeSubstancePriority,
  projectLibraryInput,
} from "../../convex/lib/substanceReadProjections";
import {
  projectPublicEffectIndexPost,
  projectPublicEffectIndexPosts,
  type PublicEffectIndexPost,
} from "../../convex/lib/effectIndexArchiveReadProjections";

type QueryArgs = Record<string, unknown>;
type QueryTransport = <Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args,
) => Promise<Result>;

const ABOUT_PREVIEW_COUNT = 12;
const ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE = 64;
const PUBLIC_SUBSTANCE_PAGE_SIZE = 32;
const PUBLIC_CORPUS_MAX_PAGES = 512;
const PUBLIC_CORPUS_MAX_ROWS = 20_000;
const ABOUT_PREVIEW_MAX_PAGES = 128;
const ABOUT_PREVIEW_MAX_ROWS = 8_192;

const publicSubstancePageArgs = (cursor?: string) => ({
  ...(cursor ? { cursor } : {}),
  limit: PUBLIC_SUBSTANCE_PAGE_SIZE,
});

export const publicDataReadCatalog = {
  publicSubstanceLibraryInput: {
    functionName: "substanceIndex:getPublicLibraryInputPage",
    args: publicSubstancePageArgs,
  },
  publicSubstanceCoverageInput: {
    functionName: "substanceIndex:getPublicCoverageInputPage",
    args: publicSubstancePageArgs,
  },
  publicSubstanceMechanismRouteInput: {
    functionName: "substanceIndex:getPublicMechanismRouteInputPage",
    args: publicSubstancePageArgs,
  },
  publicAboutPreviewCandidates: {
    functionName: "substanceIndex:getPublicAboutPreviewCandidates",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE,
    }),
  },
  publicCategoryLayout: { functionName: "categoryLayout:get", args: () => ({}) },
  publicSubstanceLookup: {
    functionName: "substanceIndex:getPublicLookupPage",
    args: publicSubstancePageArgs,
  },
  publicSubstancePreviews: {
    functionName: "substanceIndex:getPublicPreviewsPage",
    args: publicSubstancePageArgs,
  },
  publicSubstanceBySlug: { functionName: "substanceIndex:getPublicBySlug", args: (slug: string) => ({ slug }) },
  publicEffectRecords: { functionName: "subjectiveEffects:getPublicPreviews", args: () => ({}) },
  publicEffectBySlug: { functionName: "subjectiveEffects:getPublicBySlug", args: (slug: string) => ({ slug }) },
  publicEffectArticles: { functionName: "subjectiveEffects:getPublicArticles", args: () => ({}) },
  publicEffectsByCategory: {
    functionName: "subjectiveEffects:getPublicByCategory",
    args: (category: string) => ({ category }),
  },
  publicEffectIndexArticles: {
    functionName: "effectIndexArticles:getAll",
    args: () => ({}),
  },
  publicEffectIndexArticleBySlug: {
    functionName: "effectIndexArticles:getBySlug",
    args: (slug: string) => ({ slug }),
  },
  publicEffectIndexPosts: {
    functionName: "effectIndexArchive:listPosts",
    args: () => ({}),
  },
  publicEffectIndexPostBySlug: {
    functionName: "effectIndexArchive:getPostBySlug",
    args: (slug: string) => ({ slug }),
  },
  publicReplicationsByEffect: {
    functionName: "replications:getReplicationsByEffect",
    args: (effectSlug: string) => ({ effect_slug: effectSlug }),
  },
  publicReplications: {
    functionName: "replications:getPublicReplications",
    args: () => ({}),
  },
  publicReplicationBySlug: {
    functionName: "replications:getBySlug",
    args: (slug: string) => ({ slug }),
  },
  publicReplicationsByArtistNames: {
    functionName: "replications:getByArtistNames",
    args: (artistNames: string[]) => ({ artistNames }),
  },
  publicTripReportRecords: { functionName: "tripReports:getAll", args: () => ({}) },
  publicTripReportBySlug: { functionName: "tripReports:getBySlug", args: (slug: string) => ({ slug }) },
  publicTripReportsByAuthor: {
    functionName: "tripReports:getByAuthor",
    args: (authorName: string) => ({ authorName }),
  },
  publicTripReportsByContributor: {
    functionName: "tripReports:getByContributor",
    args: (profileKey: string, authorNames: string[]) => ({ profileKey, authorNames }),
  },
  publicTripReportsBySubstanceNames: {
    functionName: "tripReports:getBySubstanceNames",
    args: (substanceNames: string[]) => ({ substanceNames }),
  },
  publicContributorProfiles: { functionName: "contributorProfiles:getAll", args: () => ({}) },
  publicAboutConfig: { functionName: "siteConfig:getAbout", args: () => ({}) },
  publicIndexLayoutByType: { functionName: "indexLayouts:getByType", args: (type: IndexLayoutType) => ({ type }) },
} as const;

export type PublicDataReadAdapter = {
  getRawSubstances(): Promise<PublicSubstanceLibraryRecord[]>;
  getPublicCoverageSubstances(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicMechanismRouteInput(): Promise<PublicMechanismRouteInput[]>;
  getPublicAboutPreviewSubstances(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicCategoryLayout(): Promise<PublicCategoryLayout | null>;
  getPublicSubstanceLookup(): Promise<PublicSubstanceLookupEntry[]>;
  getPublicSubstancePreviews(): Promise<PublicSubstancePreview[]>;
  getPublicSubstanceBySlug(slug: string): Promise<PublicSubstanceRecord | null>;
  getPublicEffects(): Promise<PublicEffectPreview[]>;
  getPublicEffectBySlug(slug: string): Promise<SubjectiveEffectDetailRecord | null>;
  getPublicEffectArticles(): Promise<PublicEffectArticle[]>;
  getPublicEffectsByCategory(category: string): Promise<PublicEffectPreview[]>;
  getPublicEffectIndexArticles(): Promise<PublicEffectIndexArticle[]>;
  getPublishedEffectIndexArticles(): Promise<PublicEffectIndexArticle[]>;
  getPublicEffectIndexArticleBySlug(slug: string): Promise<PublicEffectIndexArticle | null>;
  getPublicEffectIndexPosts(): Promise<PublicEffectIndexPost[]>;
  getPublicEffectIndexPostBySlug(slug: string): Promise<PublicEffectIndexPost | null>;
  getPublicReplicationsByEffect(effectSlug: string): Promise<ReplicationWithUrl[]>;
  getPublicReplications(): Promise<GalleryReplication[]>;
  getPublicReplicationBySlug(slug: string): Promise<ReplicationWithUrl | null>;
  getPublicReplicationsByArtistNames(artistNames: string[]): Promise<ReplicationWithUrl[]>;
  getPublicTripReportRecords(): Promise<TripReportRecord[]>;
  getPublicTripReportBySlug(slug: string): Promise<TripReportDetailRecord | null>;
  getPublicTripReportsByAuthor(authorName: string): Promise<TripReportRecord[]>;
  getPublicTripReportsByContributor(profileKey: string, authorNames: string[]): Promise<TripReportRecord[]>;
  getPublicTripReportsBySubstanceNames(substanceNames: string[]): Promise<TripReportDetailRecord[]>;
  getPublicContributorProfiles(): Promise<NormalizedUserProfile[]>;
  getPublicAboutConfig(): Promise<AboutConfigRecord | null>;
  getPublicIndexLayoutByType(type: IndexLayoutType): Promise<IndexLayoutRecord | null>;
};

export const projectPublicEffectPreview = (effect: SubjectiveEffectRecord): PublicEffectPreview => ({
  name: effect.name,
  slug: effect.slug,
  summary: trimExcerpt(effect.summary, 170),
  featured: effect.featured === true,
  tags: effect.tags,
});

export const projectPublicEffectPreviews = (effects: SubjectiveEffectRecord[]): PublicEffectPreview[] =>
  effects.map(projectPublicEffectPreview).sort((left, right) => {
    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

function normalizePublicEffectArticle(effect: SubjectiveEffectDetailRecord): SubjectiveEffectDetailRecord {
  return {
    slug: effect.slug,
    name: effect.name,
    tags: effect.tags,
    featured: effect.featured,
    summary: effect.summary,
    description_raw: effect.description_raw,
    description_ast: normalizeVCodeContent(effect.description_ast, undefined),
    long_summary_raw: effect.long_summary_raw,
    long_summary_ast: normalizeVCodeContent(effect.long_summary_ast, undefined),
    analysis_raw: effect.analysis_raw,
    analysis_ast: normalizeVCodeContent(effect.analysis_ast, undefined),
    style_variations_raw: effect.style_variations_raw,
    style_variations_ast: normalizeVCodeContent(effect.style_variations_ast, undefined),
    personal_commentary_raw: effect.personal_commentary_raw,
    personal_commentary_ast: normalizeVCodeContent(effect.personal_commentary_ast, undefined),
    social_media_image: effect.social_media_image,
    gallery_order: effect.gallery_order,
    audio_replications: effect.audio_replications,
    see_also: effect.see_also,
    external_links: effect.external_links,
    subarticles: effect.subarticles,
    contributors: effect.contributors,
    citations: effect.citations,
  };
}

const normalizePublicEffectArticles = (effects: SubjectiveEffectDetailRecord[]): PublicEffectArticle[] =>
  effects.map(normalizePublicEffectArticle);

const slugifySubstanceTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const resolveSubstanceSlug = (substance: Pick<SubstanceRecord, "slug" | "title">): string =>
  typeof substance.slug === "string" && substance.slug.length > 0
    ? substance.slug
    : slugifySubstanceTitle(substance.title);

export function projectPublicSubstanceLookup(substance: SubstanceRecord): PublicSubstanceLookupEntry {
  return {
    slug: resolveSubstanceSlug(substance),
    name: substance.title,
    priority: normalizeSubstancePriority(substance.priority),
  };
}

export function projectPublicSubstancePreview(substance: SubstanceRecord): PublicSubstancePreview {
  return {
    title: substance.title,
    slug: resolveSubstanceSlug(substance),
    summary: trimExcerpt(typeof substance.summary === "string" ? substance.summary : "", 200),
    priority: normalizeSubstancePriority(substance.priority),
    indexCategories: substance.index_categories,
  };
}

export function projectPublicSubstanceLibraryRecord(substance: SubstanceRecord): PublicSubstanceLibraryRecord {
  return projectLibraryInput(substance);
}

export function projectPublicSubstanceRecord(substance: SubstanceRecord): PublicSubstanceRecord {
  const { editorial_review: editorialReview, ...publicSubstance } = substance;
  const references = Array.isArray(substance.references)
    ? substance.references.map((reference) => {
        const { metadataProvenance: _metadataProvenance, ...publicReference } = reference;
        return publicReference;
      })
    : substance.references;

  return {
    ...publicSubstance,
    references,
    slug: resolveSubstanceSlug(substance),
    priority: normalizeSubstancePriority(substance.priority),
    expert_reviewed: editorialReview?.status === "completed",
  };
}

export const projectPublicSubstancePreviews = (substances: SubstanceRecord[]): PublicSubstancePreview[] =>
  substances.map(projectPublicSubstancePreview).sort((left, right) => {
    const priorityDelta = priorityScore[left.priority] - priorityScore[right.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.title.localeCompare(right.title);
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizePublicEffectIndexArticle(record: unknown): PublicEffectIndexArticle | null {
  // Second line of defence behind the Convex-side draft filter in
  // `effectIndexArticles.getAll`/`getBySlug`: every public list and detail read
  // funnels through this normalizer, so a draft cannot reach a route loader
  // even if it were served by a stale deployment of those queries.
  if (isRecord(record) && record.status === "draft") {
    return null;
  }

  if (
    !isRecord(record) ||
    typeof record.slug !== "string" ||
    typeof record.title !== "string" ||
    typeof record.publication_status !== "string" ||
    !Array.isArray(record.tags) ||
    !record.tags.every((tag) => typeof tag === "string") ||
    typeof record.body_raw !== "string"
  ) {
    return null;
  }

  const bodyAst = normalizeVCodeContent(record.body_ast, record.body_raw);
  const article: PublicEffectIndexArticle = {
    slug: record.slug,
    title: record.title,
    tags: record.tags,
    publication_status: record.publication_status,
    body_raw: record.body_raw,
  };

  if (typeof record.featured === "boolean") article.featured = record.featured;
  if (typeof record.shortDescription === "string") article.shortDescription = record.shortDescription;
  if (typeof record.publicationDate === "string") article.publicationDate = record.publicationDate;
  if (bodyAst) article.body_ast = bodyAst;
  if (Array.isArray(record.authors) && record.authors.every((author) => typeof author === "string")) {
    article.authors = record.authors;
  }
  if (Array.isArray(record.citations)) {
    article.citations = record.citations.flatMap((citation) =>
      isRecord(citation) && typeof citation.url === "string" && typeof citation.text === "string"
        ? [{ url: citation.url, text: citation.text }]
        : [],
    );
  }

  return article;
}

function normalizePublicEffectIndexArticles(records: unknown[]): PublicEffectIndexArticle[] {
  return records.flatMap((record) => {
    const article = normalizePublicEffectIndexArticle(record);
    return article ? [article] : [];
  });
}

function omitPublicArticleReferenceProvenance(
  article: PublicSubstanceArticleRecord,
): PublicSubstanceArticleRecord {
  return {
    ...article,
    references: article.references.map((reference) => {
      const { metadataProvenance: _metadataProvenance, ...publicReference } = reference;
      return publicReference;
    }),
  };
}

function parsePublicSubstanceRecordWithoutProvenance(
  record: unknown,
): PublicSubstanceArticleRecord | null {
  const parsed = parsePublicSubstanceRecord(record);
  return parsed ? omitPublicArticleReferenceProvenance(parsed) : null;
}

function parsePublicSubstanceRecordsWithoutProvenance(
  records: unknown[],
): PublicSubstanceArticleRecord[] {
  return parsePublicSubstanceRecords(records).map(
    omitPublicArticleReferenceProvenance,
  );
}

function selectPublicAboutPreviewSubstances(
  records: unknown[],
): PublicSubstanceArticleRecord[] {
  return parsePublicSubstanceRecordsWithoutProvenance(records)
    .filter((substance) => substance.priority !== "low")
    .slice(0, ABOUT_PREVIEW_COUNT);
}

function warnAboutPreviewShortfall(
  selected: readonly PublicSubstanceArticleRecord[],
): void {
  if (selected.length < ABOUT_PREVIEW_COUNT) {
    console.warn(
      `[public-about] Exhausted the substance corpus with only ${selected.length} valid non-low preview candidates.`,
    );
  }
}

function isExplicitMissingPublicFunctionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("could not find public function")
  );
}

/**
 * Degradation guard for the additive Effect Index archive blog queries.
 *
 * Deliberately broader than the explicit missing-function check used by the replication gallery.
 * Here a wrong guess costs a silently empty
 * blog, and production Convex reports *every* failure — a missing function, a bad
 * argument, an internal error — as the same opaque `Server Error`. So the tolerance is
 * kept but made loud: the caller logs before degrading, and the blog post route stays
 * dynamic-params-enabled so a degraded build renders posts on demand instead of baking
 * a permanent 404 for every slug.
 */
function reportDegradedEffectIndexArchiveRead(scope: string, error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  if (
    !message.includes("could not find public function") &&
    !message.includes("server error")
  ) {
    return false;
  }

  console.warn(
    `[publicData] Effect Index archive read "${scope}" failed and degraded to empty. ` +
      `If effectIndexArchive:listPosts/getPostBySlug are deployed, this is a real Convex ` +
      `error and the blog output of this build is incomplete. Cause: ${error.message}`,
  );

  return true;
}

type PublicCorpusPage<Item> = {
  items: Item[];
  cursor: string;
  isDone: boolean;
};

type PublicCorpusPageSource = {
  functionName: string;
  args: (cursor?: string) => { cursor?: string; limit: number };
};

type PublicCorpusDrainLimits = {
  maxPages: number;
  maxRows: number;
};

type PublicCorpusVisitResult = "done" | "stopped";

async function visitPublicCorpusPages<Item>(
  query: QueryTransport,
  source: PublicCorpusPageSource,
  limits: PublicCorpusDrainLimits,
  visitItems: (items: Item[]) => boolean,
): Promise<PublicCorpusVisitResult> {
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let rowCount = 0;

  for (let pageNumber = 1; pageNumber <= limits.maxPages; pageNumber += 1) {
    const page = await query<PublicCorpusPage<Item>, { cursor?: string; limit: number }>(
      source.functionName,
      source.args(cursor),
    );

    if (!Array.isArray(page.items) || typeof page.isDone !== "boolean") {
      throw new Error(`Public corpus page "${source.functionName}" returned an invalid payload.`);
    }
    rowCount += page.items.length;
    if (rowCount > limits.maxRows) {
      throw new Error(
        `Public corpus pagination for "${source.functionName}" exceeded maxRows (${limits.maxRows}).`,
      );
    }
    if (visitItems(page.items)) {
      return "stopped";
    }
    if (page.isDone) {
      return "done";
    }
    if (
      typeof page.cursor !== "string" ||
      page.cursor.length === 0 ||
      seenCursors.has(page.cursor)
    ) {
      throw new Error(`Public corpus pagination for "${source.functionName}" did not advance.`);
    }
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }

  throw new Error(
    `Public corpus pagination for "${source.functionName}" exceeded maxPages (${limits.maxPages}).`,
  );
}

async function drainPublicCorpusPages<Item>(
  query: QueryTransport,
  source: PublicCorpusPageSource,
): Promise<Item[]> {
  const items: Item[] = [];
  await visitPublicCorpusPages<Item>(
    query,
    source,
    { maxPages: PUBLIC_CORPUS_MAX_PAGES, maxRows: PUBLIC_CORPUS_MAX_ROWS },
    (pageItems) => {
      items.push(...pageItems);
      return false;
    },
  );
  return items;
}

async function queryPaginatedPublicProjectionRead<RawItem, PublicResult>(
  query: QueryTransport,
  source: PublicCorpusPageSource,
  project: (result: RawItem[]) => PublicResult,
): Promise<PublicResult> {
  return project(await drainPublicCorpusPages<RawItem>(query, source));
}

export function createConvexPublicDataReadAdapter(query: QueryTransport = queryConvex): PublicDataReadAdapter {
  return {
    getRawSubstances: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstanceLibraryInput,
        parsePublicSubstanceLibraryInputRecords,
      ),
    getPublicCoverageSubstances: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstanceCoverageInput,
        parsePublicSubstanceRecordsWithoutProvenance,
      ),
    getPublicMechanismRouteInput: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstanceMechanismRouteInput,
        (records: PublicMechanismRouteInput[]) => records,
      ),
    getPublicAboutPreviewSubstances: async () => {
      const selected: PublicSubstanceArticleRecord[] = [];
      const result = await visitPublicCorpusPages(
        query,
        publicDataReadCatalog.publicAboutPreviewCandidates,
        { maxPages: ABOUT_PREVIEW_MAX_PAGES, maxRows: ABOUT_PREVIEW_MAX_ROWS },
        (pageItems: unknown[]) => {
          const remaining = ABOUT_PREVIEW_COUNT - selected.length;
          selected.push(
            ...selectPublicAboutPreviewSubstances(pageItems).slice(0, remaining),
          );
          return selected.length === ABOUT_PREVIEW_COUNT;
        },
      );
      if (result === "done") {
        warnAboutPreviewShortfall(selected);
      }
      return selected;
    },
    getPublicCategoryLayout: () =>
      query<PublicCategoryLayout | null>(publicDataReadCatalog.publicCategoryLayout.functionName, {}),
    getPublicSubstanceLookup: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstanceLookup,
        (entries: PublicSubstanceLookupEntry[]) => entries,
      ),
    getPublicSubstancePreviews: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstancePreviews,
        (entries: PublicSubstancePreview[]) =>
          [...entries].sort((left, right) => {
            const priorityDelta = priorityScore[left.priority] - priorityScore[right.priority];
            return priorityDelta !== 0
              ? priorityDelta
              : left.title.localeCompare(right.title);
          }),
      ),
    getPublicSubstanceBySlug: async (slug) => {
      const substance = await query<unknown | null, { slug: string }>(
        publicDataReadCatalog.publicSubstanceBySlug.functionName,
        publicDataReadCatalog.publicSubstanceBySlug.args(slug),
      );
      return substance ? parsePublicSubstanceRecordWithoutProvenance(substance) : null;
    },
    getPublicEffects: async () =>
      projectPublicEffectPreviews(
        await query<SubjectiveEffectRecord[]>(
          publicDataReadCatalog.publicEffectRecords.functionName,
          publicDataReadCatalog.publicEffectRecords.args(),
        ),
      ),
    getPublicEffectBySlug: async (slug) => {
      const effect = await query<SubjectiveEffectDetailRecord | null, { slug: string }>(
        publicDataReadCatalog.publicEffectBySlug.functionName,
        publicDataReadCatalog.publicEffectBySlug.args(slug),
      );
      return effect ? normalizePublicEffectArticle(effect) : null;
    },
    getPublicEffectArticles: async () =>
      normalizePublicEffectArticles(
        await query<SubjectiveEffectDetailRecord[]>(
          publicDataReadCatalog.publicEffectArticles.functionName,
          publicDataReadCatalog.publicEffectArticles.args(),
        ),
      ),
    getPublicEffectsByCategory: async (category) =>
      (
        await query<SubjectiveEffectRecord[], { category: string }>(
          publicDataReadCatalog.publicEffectsByCategory.functionName,
          publicDataReadCatalog.publicEffectsByCategory.args(category),
        )
      ).map(projectPublicEffectPreview),
    getPublicEffectIndexArticles: async () =>
      normalizePublicEffectIndexArticles(
        await query<unknown[]>(
          publicDataReadCatalog.publicEffectIndexArticles.functionName,
          publicDataReadCatalog.publicEffectIndexArticles.args(),
        ),
      ),
    getPublishedEffectIndexArticles: async () =>
      normalizePublicEffectIndexArticles(
        await query<unknown[]>(
          publicDataReadCatalog.publicEffectIndexArticles.functionName,
          publicDataReadCatalog.publicEffectIndexArticles.args(),
        ),
      ).filter((article) => article.publication_status === "published"),
    getPublicEffectIndexArticleBySlug: async (slug) =>
      normalizePublicEffectIndexArticle(
        await query<unknown | null, { slug: string }>(
          publicDataReadCatalog.publicEffectIndexArticleBySlug.functionName,
          publicDataReadCatalog.publicEffectIndexArticleBySlug.args(slug),
        ),
      ),
    // The archive blog queries are additive and only reached on the Effect Index build.
    // A deployment that predates them degrades to an empty blog rather than failing a
    // build whose `generateStaticParams` runs against production Convex — but it says so
    // in the build log, because production cannot distinguish "not deployed" from a real
    // failure. See `reportDegradedEffectIndexArchiveRead`.
    getPublicEffectIndexPosts: async () => {
      try {
        return projectPublicEffectIndexPosts(
          await query<unknown[]>(
            publicDataReadCatalog.publicEffectIndexPosts.functionName,
            publicDataReadCatalog.publicEffectIndexPosts.args(),
          ),
        );
      } catch (error) {
        if (reportDegradedEffectIndexArchiveRead("listPosts", error)) {
          return [];
        }
        throw error;
      }
    },
    getPublicEffectIndexPostBySlug: async (slug) => {
      try {
        return projectPublicEffectIndexPost(
          await query<unknown | null, { slug: string }>(
            publicDataReadCatalog.publicEffectIndexPostBySlug.functionName,
            publicDataReadCatalog.publicEffectIndexPostBySlug.args(slug),
          ),
        );
      } catch (error) {
        if (reportDegradedEffectIndexArchiveRead(`getPostBySlug(${slug})`, error)) {
          return null;
        }
        throw error;
      }
    },
    getPublicReplicationsByEffect: (effectSlug) =>
      query<ReplicationWithUrl[], { effect_slug: string }>(
        publicDataReadCatalog.publicReplicationsByEffect.functionName,
        publicDataReadCatalog.publicReplicationsByEffect.args(effectSlug),
      ),
    getPublicReplications: async () => {
      // The cross-effect gallery query is additive; tolerate a deployment that
      // predates it by degrading to an empty gallery rather than failing the
      // public /effects render.
      try {
        return await query<GalleryReplication[]>(publicDataReadCatalog.publicReplications.functionName, {});
      } catch (error) {
        if (isExplicitMissingPublicFunctionError(error)) {
          return [];
        }
        throw error;
      }
    },
    // Single-row read for the replication permalink. Deliberately not served off
    // getPublicReplications() — that pulls the whole table for one item.
    getPublicReplicationBySlug: (slug) =>
      query<ReplicationWithUrl | null, { slug: string }>(
        publicDataReadCatalog.publicReplicationBySlug.functionName,
        publicDataReadCatalog.publicReplicationBySlug.args(slug),
      ),
    // Contributor-scoped replication read. Additive like getPublicReplications,
    // so a deployment that predates the query degrades to "no works" instead of
    // failing the contributor page — but says so, because an empty portfolio and
    // a missing function look identical on the rendered page.
    getPublicReplicationsByArtistNames: async (artistNames) => {
      try {
        return await query<ReplicationWithUrl[], { artistNames: string[] }>(
          publicDataReadCatalog.publicReplicationsByArtistNames.functionName,
          publicDataReadCatalog.publicReplicationsByArtistNames.args(artistNames),
        );
      } catch (error) {
        if (isExplicitMissingPublicFunctionError(error)) {
          console.warn(
            "[publicData] replications:getByArtistNames is not deployed; contributor replication credits degraded to empty.",
          );
          return [];
        }
        throw error;
      }
    },
    getPublicTripReportRecords: () =>
      query<TripReportRecord[]>(publicDataReadCatalog.publicTripReportRecords.functionName, {}),
    getPublicTripReportBySlug: (slug) =>
      query<TripReportDetailRecord | null, { slug: string }>(
        publicDataReadCatalog.publicTripReportBySlug.functionName,
        publicDataReadCatalog.publicTripReportBySlug.args(slug),
      ),
    getPublicTripReportsByAuthor: (authorName) =>
      query<TripReportRecord[], { authorName: string }>(
        publicDataReadCatalog.publicTripReportsByAuthor.functionName,
        publicDataReadCatalog.publicTripReportsByAuthor.args(authorName),
      ),
    getPublicTripReportsByContributor: (profileKey, authorNames) =>
      query<TripReportRecord[], { profileKey: string; authorNames: string[] }>(
        publicDataReadCatalog.publicTripReportsByContributor.functionName,
        publicDataReadCatalog.publicTripReportsByContributor.args(profileKey, authorNames),
      ),
    getPublicTripReportsBySubstanceNames: (substanceNames) =>
      query<TripReportDetailRecord[], { substanceNames: string[] }>(
        publicDataReadCatalog.publicTripReportsBySubstanceNames.functionName,
        publicDataReadCatalog.publicTripReportsBySubstanceNames.args(substanceNames),
      ),
    getPublicContributorProfiles: () =>
      query<NormalizedUserProfile[]>(publicDataReadCatalog.publicContributorProfiles.functionName, {}),
    getPublicAboutConfig: () => query<AboutConfigRecord | null>(publicDataReadCatalog.publicAboutConfig.functionName, {}),
    getPublicIndexLayoutByType: (type) =>
      query<IndexLayoutRecord | null, { type: IndexLayoutType }>(
        publicDataReadCatalog.publicIndexLayoutByType.functionName,
        publicDataReadCatalog.publicIndexLayoutByType.args(type),
      ),
  };
}

const defaultPublicDataReadAdapter = createConvexPublicDataReadAdapter();

let publicDataReadAdapter: PublicDataReadAdapter = defaultPublicDataReadAdapter;

export function getPublicDataReadAdapter(): PublicDataReadAdapter {
  return publicDataReadAdapter;
}

export function setPublicDataReadAdapterForTest(adapter: PublicDataReadAdapter) {
  publicDataReadAdapter = adapter;
}

export function resetPublicDataReadAdapterForTest() {
  publicDataReadAdapter = defaultPublicDataReadAdapter;
}
