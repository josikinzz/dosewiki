import "server-only";

import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type {
  GalleryReplication,
  PublicReplicationArtistTaxonomy,
  PublicGalleryReplicationPreview,
  ReplicationWithUrl,
} from "../../src/types/replications";
import type {
  ContributorReviewedArticle,
  ReviewedArticleCredit,
} from "../../src/types/reviewedArticles";
import type { PublicSubstanceGallery } from "../../src/data/substanceReplicationGallery";
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
import { publicDataReadCatalog } from "./publicData.readCatalog";

export { publicDataReadCatalog };

type QueryArgs = Record<string, unknown>;
type QueryTransport = <Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args,
) => Promise<Result>;

const ABOUT_PREVIEW_COUNT = 12;
const PUBLIC_CORPUS_MAX_PAGES = 512;
const PUBLIC_CORPUS_MAX_ROWS = 20_000;
const ABOUT_PREVIEW_MAX_PAGES = 128;
const ABOUT_PREVIEW_MAX_ROWS = 8_192;

/**
 * A full substance article document as stored in Convex, minus nothing: the
 * open-data export publishes the same record shape as the committed
 * `SubstanceIndex.json`, so no projection narrows it here. Convex internals
 * (`_id`, `_creationTime`) are stripped at the serving edge.
 */
export type PublicFullSubstanceDocument = Record<string, unknown>;

export type PublicGalleryReplicationPage = {
  items: PublicGalleryReplicationPreview[];
  cursor: string;
  isDone: boolean;
};

export type PublicDataReadAdapter = {
  getRawSubstances(): Promise<PublicSubstanceLibraryRecord[]>;
  getPublicCoverageSubstances(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicMechanismRouteInput(): Promise<PublicMechanismRouteInput[]>;
  getPublicAboutPreviewSubstances(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicCategoryLayout(): Promise<PublicCategoryLayout | null>;
  getPublicSubstanceLookup(): Promise<PublicSubstanceLookupEntry[]>;
  getPublicSubstancePreviews(): Promise<PublicSubstancePreview[]>;
  getPublicSubstanceBySlug(slug: string): Promise<PublicSubstanceRecord | null>;
  getPublicReviewedArticlesByContributor(profileKey: string): Promise<ContributorReviewedArticle[]>;
  getPublicReviewedArticleCredits(): Promise<ReviewedArticleCredit[]>;
  getPublicFullSubstanceDocuments(): Promise<PublicFullSubstanceDocument[]>;
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
  getPublicGalleryReplicationPage(cursor?: string, limit?: number): Promise<PublicGalleryReplicationPage>;
  getPublicReplicationArtistsByKeys(keys: string[]): Promise<PublicReplicationArtistTaxonomy[]>;
  getPublicReplicationBySlug(slug: string): Promise<ReplicationWithUrl | null>;
  getPublicReplicationsByArtistNames(artistNames: string[]): Promise<ReplicationWithUrl[]>;
  getPublicReplicationsForSubstance(substanceSlug: string): Promise<PublicSubstanceGallery>;
  getPublicTripReportRecords(): Promise<TripReportRecord[]>;
  getPublicTripReportBySlug(slug: string): Promise<TripReportDetailRecord | null>;
  getPublicTripReportsByAuthor(authorName: string): Promise<TripReportRecord[]>;
  getPublicTripReportsByContributor(profileKey: string, authorNames: string[]): Promise<TripReportRecord[]>;
  getPublicTripReportsBySubstanceNames(substanceNames: string[]): Promise<TripReportDetailRecord[]>;
  getPublicContributorProfiles(): Promise<NormalizedUserProfile[]>;
  getPublicAboutConfig(): Promise<AboutConfigRecord | null>;
  getPublicFeaturedReplicationSlugs(): Promise<string[] | null>;
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

  // A markdown-bodied row has no VCode at all, and parsing its `body_raw` as
  // VCode would hand the renderer a bogus AST it would then prefer over the
  // Markdown source. Only the VCode path derives an AST.
  const bodyFormat =
    record.bodyFormat === "markdown" || record.bodyFormat === "vcode"
      ? record.bodyFormat
      : undefined;
  const bodyAst =
    bodyFormat === "markdown"
      ? undefined
      : normalizeVCodeContent(record.body_ast, record.body_raw);
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
  if (bodyFormat) article.bodyFormat = bodyFormat;
  if (record.kind === "article" || record.kind === "blog") article.kind = record.kind;
  if (typeof record.teaser === "string") article.teaser = record.teaser;
  if (typeof record.coverImageUrl === "string") article.coverImageUrl = record.coverImageUrl;
  if (Array.isArray(record.authors) && record.authors.every((author) => typeof author === "string")) {
    article.authors = record.authors;
  }
  if (
    Array.isArray(record.authorProfileKeys) &&
    record.authorProfileKeys.every((key) => typeof key === "string")
  ) {
    article.authorProfileKeys = record.authorProfileKeys;
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

let hasWarnedAboutReplicationArtistTaxonomy = false;

function reportDegradedReplicationArtistTaxonomyRead(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (
    !message.includes("could not find public function") &&
    !message.includes("server error")
  ) {
    return false;
  }
  if (!hasWarnedAboutReplicationArtistTaxonomy) {
    hasWarnedAboutReplicationArtistTaxonomy = true;
    console.warn(
      "[publicData] replication artist taxonomy read failed and degraded to untagged; this is expected while backend functions deploy before the frontend.",
    );
  }
  return true;
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

type ConvexPaginationPage<Item> = {
  page: Item[];
  isDone: boolean;
  continueCursor: string | null;
};

/**
 * Drain a standard Convex `paginationOpts` query (page/isDone/continueCursor),
 * unlike the bespoke corpus pages above (items/cursor/isDone). Shares their
 * fail-closed guards against malformed pages, stalled cursors, and runaway
 * reads.
 */
async function drainConvexPaginationPages<Item>(
  query: QueryTransport,
  source: {
    functionName: string;
    args: (cursor: string | null) => { paginationOpts: { cursor: string | null; numItems: number } };
  },
): Promise<Item[]> {
  const items: Item[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let pageNumber = 1; pageNumber <= PUBLIC_CORPUS_MAX_PAGES; pageNumber += 1) {
    const result = await query<ConvexPaginationPage<Item>, { paginationOpts: { cursor: string | null; numItems: number } }>(
      source.functionName,
      source.args(cursor),
    );
    if (!Array.isArray(result.page) || typeof result.isDone !== "boolean") {
      throw new Error(`Convex pagination for "${source.functionName}" returned an invalid payload.`);
    }
    items.push(...result.page);
    if (items.length > PUBLIC_CORPUS_MAX_ROWS) {
      throw new Error(
        `Convex pagination for "${source.functionName}" exceeded maxRows (${PUBLIC_CORPUS_MAX_ROWS}).`,
      );
    }
    if (result.isDone) {
      return items;
    }
    const nextCursor = result.continueCursor;
    if (
      typeof nextCursor !== "string" ||
      nextCursor.length === 0 ||
      nextCursor === cursor ||
      seenCursors.has(nextCursor)
    ) {
      throw new Error(`Convex pagination for "${source.functionName}" did not advance.`);
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error(
    `Convex pagination for "${source.functionName}" exceeded maxPages (${PUBLIC_CORPUS_MAX_PAGES}).`,
  );
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
    getPublicFullSubstanceDocuments: () =>
      drainConvexPaginationPages<PublicFullSubstanceDocument>(
        query,
        publicDataReadCatalog.publicSubstanceFullDocuments,
      ),
    // Contributor-scoped reviewed-articles aggregate. Additive like the
    // contributor replication read below: a deployment that predates the query
    // degrades to "no reviewed articles" (the profile renders no section) —
    // but says so, because an unreviewed contributor and a missing function
    // look identical on the rendered page.
    getPublicReviewedArticlesByContributor: async (profileKey) => {
      try {
        return await drainPublicCorpusPages<ContributorReviewedArticle>(query, {
          functionName:
            publicDataReadCatalog.publicReviewedArticlesByContributor.functionName,
          args: (cursor) =>
            publicDataReadCatalog.publicReviewedArticlesByContributor.args(profileKey, cursor),
        });
      } catch (error) {
        if (isExplicitMissingPublicFunctionError(error)) {
          console.warn(
            "[publicData] substanceIndex:getPublicReviewedArticlesPage is not deployed; contributor reviewed articles degraded to empty.",
          );
          return [];
        }
        throw error;
      }
    },
    // Bulk counterpart of the read above, for the About roster's reference
    // counts: every completed review as a (slug, profileKey) credit in one
    // corpus pass. Same additive degrade, same reason to say so out loud.
    getPublicReviewedArticleCredits: async () => {
      try {
        return await drainPublicCorpusPages<ReviewedArticleCredit>(query, {
          functionName: publicDataReadCatalog.publicReviewedArticleCredits.functionName,
          args: (cursor) => publicDataReadCatalog.publicReviewedArticleCredits.args(cursor),
        });
      } catch (error) {
        if (isExplicitMissingPublicFunctionError(error)) {
          console.warn(
            "[publicData] substanceIndex:getPublicReviewedArticleCreditsPage is not deployed; review credits degraded to empty.",
          );
          return [];
        }
        throw error;
      }
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
    getPublicGalleryReplicationPage: (cursor, limit = 64) =>
      query<PublicGalleryReplicationPage, { cursor?: string; limit: number }>(
        publicDataReadCatalog.publicReplicationGalleryPage.functionName,
        publicDataReadCatalog.publicReplicationGalleryPage.args(cursor, limit),
      ),
    getPublicReplicationArtistsByKeys: async (keys) => {
      if (keys.length === 0) return [];
      try {
        return await query<PublicReplicationArtistTaxonomy[], { keys: string[] }>(
          publicDataReadCatalog.publicReplicationArtistsByKeys.functionName,
          publicDataReadCatalog.publicReplicationArtistsByKeys.args(keys),
        );
      } catch (error) {
        if (reportDegradedReplicationArtistTaxonomyRead(error)) {
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
    // Contributor replication read degrades explicitly when an older deployment lacks it.
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
    // Substance showcase read also degrades explicitly across function rollout.
    getPublicReplicationsForSubstance: async (substanceSlug) => {
      try {
        return await query<PublicSubstanceGallery, { substance_slug: string }>(
          publicDataReadCatalog.publicReplicationsForSubstance.functionName,
          publicDataReadCatalog.publicReplicationsForSubstance.args(substanceSlug),
        );
      } catch (error) {
        if (isExplicitMissingPublicFunctionError(error)) {
          console.warn(
            "[publicData] substanceGalleries:getPublicReplicationsForSubstance is not deployed; substance showcases degraded to empty.",
          );
          return { items: [] };
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
    // The portal-editable featured carousel. `null` means "nobody has curated
    // this deployment", which is also what a deployment that predates the
    // function reports — both leave the homepage on its checked-in list, so an
    // undeployed function degrades to the previous behaviour instead of an
    // empty carousel.
    getPublicFeaturedReplicationSlugs: async () => {
      try {
        const config = await query<{ slugs: string[] } | null>(
          publicDataReadCatalog.publicFeaturedReplications.functionName,
          {},
        );
        return config?.slugs ?? null;
      } catch (error) {
        // The homepage must never fail to render over the featured list:
        // mid-deploy the function can be transiently absent or erroring, and
        // null falls back to the checked-in JSON either way.
        if (!isExplicitMissingPublicFunctionError(error)) {
          console.warn(
            "[replications] featured-slugs read failed; using the checked-in fallback.",
            error,
          );
        }
        return null;
      }
    },
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
