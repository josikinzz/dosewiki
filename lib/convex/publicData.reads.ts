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
import type {
  PublicSubstanceGallery,
  SubstanceGalleryMatchableRow,
} from "../../src/data/substanceReplicationGallery";
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
  type PublicChangelogRow,
  type PublicContributorIdentity,
  type PublicMechanismRouteInput,
  type PublicMolecule,
  type PublicMoleculeOverrideSummary,
  type PublicReplicationIdentityAttribution,
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
} from "../../src/data/projections/substanceReadProjections";
import {
  projectPublicEffectIndexPost,
  projectPublicEffectIndexPosts,
  type PublicEffectIndexPost,
} from "../../src/data/projections/effectIndexArchiveProjections";
import { publicDataReadCatalog } from "./publicData.readCatalog";
import {
  drainConvexPaginationPages,
  drainPublicCorpusPages,
  queryPaginatedPublicProjectionRead,
  visitPublicCorpusPages,
  type QueryArgs,
  type QueryTransport,
} from "./publicData.pagination";
import {
  publicDataCache,
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
  PUBLIC_SUBSTANCE_LISTS_TAG,
} from "./publicData.cache";

export { publicDataReadCatalog };

const ABOUT_PREVIEW_COUNT = 12;
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

/** One slim page of the shared substance-showcase matchable corpus. */
export type PublicMatchableReplicationPage = {
  items: SubstanceGalleryMatchableRow[];
  cursor: string;
  isDone: boolean;
};

/**
 * The stored curation row's public fields, extracted from the
 * `substanceGalleries:getBySubstance` document.
 */
export type PublicSubstanceGalleryCuration = {
  curated_slugs: string[];
  removed_slugs: string[];
  carousel_order: string[];
  disabled?: boolean;
};

export type PublicDataReadAdapter = {
  getRawSubstances(): Promise<PublicSubstanceLibraryRecord[]>;
  getPublicCoverageSubstances(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicMechanismRouteInput(): Promise<PublicMechanismRouteInput[]>;
  getPublicAboutPreviewSubstances(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicCategoryLayout(): Promise<PublicCategoryLayout | null>;
  getPublicSubstanceLookup(): Promise<PublicSubstanceLookupEntry[]>;
  getPublicSubstancePreviews(): Promise<PublicSubstancePreview[]>;
  getPublicSubstanceSlugs(): Promise<string[]>;
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
  getPublicReplications(): Promise<GalleryReplication[]>;
  getPublicGalleryReplicationPage(cursor?: string, limit?: number): Promise<PublicGalleryReplicationPage>;
  getPublicReplicationArtistsByKeys(keys: string[]): Promise<PublicReplicationArtistTaxonomy[]>;
  getPublicReplicationBySlug(slug: string): Promise<ReplicationWithUrl | null>;
  getPublicReplicationsBySlugs(slugs: string[]): Promise<ReplicationWithUrl[]>;
  getPublicReplicationsByArtistNames(artistNames: string[]): Promise<ReplicationWithUrl[]>;
  getPublicMatchableReplicationPage(cursor?: string): Promise<PublicMatchableReplicationPage>;
  getPublicSubstanceGalleryCuration(substanceSlug: string): Promise<PublicSubstanceGalleryCuration | null>;
  /** The merged showcase, or null while the query or its complete index is unavailable. */
  getPublicSubstanceGallery(substanceSlug: string): Promise<PublicSubstanceGallery | null>;
  getPublicTripReportRecords(): Promise<TripReportRecord[]>;
  getPublicTripReportBySlug(slug: string): Promise<TripReportDetailRecord | null>;
  getPublicTripReportsByAuthor(authorName: string): Promise<TripReportRecord[]>;
  getPublicTripReportsByContributor(profileKey: string, authorNames: string[]): Promise<TripReportRecord[]>;
  getPublicTripReportsBySubstanceNames(substanceNames: string[]): Promise<TripReportDetailRecord[]>;
  getPublicContributorProfiles(): Promise<NormalizedUserProfile[]>;
  getPublicAboutConfig(): Promise<AboutConfigRecord | null>;
  getPublicFeaturedReplicationSlugs(): Promise<string[] | null>;
  getPublicIndexLayoutByType(type: IndexLayoutType): Promise<IndexLayoutRecord | null>;
  getPublicMoleculeOverrideSummaries(): Promise<PublicMoleculeOverrideSummary[]>;
  /** Published `updatedAt` for one depiction, or null when none is published. */
  getPublicMoleculeUpdatedAt(slug: string): Promise<string | null>;
  getPublicMoleculeBySlug(slug: string): Promise<PublicMolecule | null>;
  /** Raw rows; callers normalize, redact, and cap diffs before caching. */
  getPublicChangelogBySubmitters(submitters: string[], limit: number): Promise<PublicChangelogRow[]>;
  getPublicChangelogByArticleSlug(slug: string, limit: number): Promise<PublicChangelogRow[]>;
  getPublicRecentChangelog(limit: number): Promise<PublicChangelogRow[]>;
  getPublicReplicationIdentityAttribution(replicationId: string): Promise<PublicReplicationIdentityAttribution | null>;
  getPublicContributorIdentityByKey(key: string): Promise<PublicContributorIdentity | null>;
  /** Unvalidated ProtestKit payload; the caller owns schema validation. */
  getPublicReagentTestBySlug(slug: string): Promise<unknown>;
  /** Unvalidated rows; the caller parses and falls back to defaults. */
  getPublicCopyBlocks(): Promise<unknown>;
  getPublicWarningBannerPresets(): Promise<unknown>;
  getPublicBannerDisplayConfig(): Promise<unknown>;
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

let hasWarnedAboutSubstanceGalleryRead = false;
let hasWarnedAboutSubstanceSlugsRead = false;

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
    // Slug set only, for link resolution. Additive across function rollout: a
    // deployment that predates `getPublicSlugsPage` falls back to draining the
    // preview pages, which is the read this one replaces, so nothing degrades
    // beyond the round trips it costs.
    getPublicSubstanceSlugs: async () => {
      let slugs: string[];
      try {
        slugs = await drainPublicCorpusPages<string>(
          query,
          publicDataReadCatalog.publicSubstanceSlugs,
        );
      } catch (error) {
        // Production Convex reports an undeployed function as an opaque
        // "Server Error", never the explicit missing-function text, so any
        // failure here takes the fallback: the preview drain is the read this
        // one replaced and was serving every article until now.
        if (!hasWarnedAboutSubstanceSlugsRead) {
          hasWarnedAboutSubstanceSlugsRead = true;
          console.warn(
            "[publicData] substanceIndex:getPublicSlugsPage failed (not deployed?); substance slugs fall back to the preview drain.",
            ...(isExplicitMissingPublicFunctionError(error) ? [] : [error]),
          );
        }
        const previews = await drainPublicCorpusPages<PublicSubstancePreview>(
          query,
          publicDataReadCatalog.publicSubstancePreviews,
        );
        slugs = previews.map(({ slug }) => slug);
      }
      return [...new Set(slugs.filter((slug) => typeof slug === "string" && slug.length > 0))].sort();
    },
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
    // Archive failures must reject: empty lists and null are authoritative absence
    // and would otherwise be persisted as successful indexes or not-found pages.
    getPublicEffectIndexPosts: async () =>
      projectPublicEffectIndexPosts(
        await query<unknown[]>(
          publicDataReadCatalog.publicEffectIndexPosts.functionName,
          publicDataReadCatalog.publicEffectIndexPosts.args(),
        ),
      ),
    getPublicEffectIndexPostBySlug: async (slug) =>
      projectPublicEffectIndexPost(
        await query<unknown | null, { slug: string }>(
          publicDataReadCatalog.publicEffectIndexPostBySlug.functionName,
          publicDataReadCatalog.publicEffectIndexPostBySlug.args(slug),
        ),
      ),
    getPublicReplications: async () =>
      // This compatibility-shaped catalog is intentionally reconstructed from
      // slim, bounded gallery pages. Public callers that only need routing,
      // counts, artist/effect grouping, or a shortlist must never invoke the
      // legacy whole-table resolver.
      drainPublicCorpusPages<GalleryReplication>(
        query,
        publicDataReadCatalog.publicReplicationGalleryPage,
      ),
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
    getPublicReplicationsBySlugs: (slugs) => {
      if (slugs.length === 0) return Promise.resolve([]);
      return query<ReplicationWithUrl[], { slugs: string[] }>(
        publicDataReadCatalog.publicReplicationsBySlugs.functionName,
        publicDataReadCatalog.publicReplicationsBySlugs.args(slugs),
      );
    },
    // Contributor replication read degrades explicitly when an older deployment lacks it.
    getPublicReplicationsByArtistNames: async (artistNames) => {
      try {
        return await drainPublicCorpusPages<ReplicationWithUrl>(query, {
          functionName:
            publicDataReadCatalog.publicReplicationsByArtistNamesPage.functionName,
          args: (cursor) =>
            publicDataReadCatalog.publicReplicationsByArtistNamesPage.args(
              artistNames,
              cursor,
            ),
        });
      } catch (error) {
        if (isExplicitMissingPublicFunctionError(error)) {
          console.warn(
            "[publicData] replications:getByArtistNamesPage is not deployed; contributor replication credits degraded to empty.",
          );
          return [];
        }
        throw error;
      }
    },
    // One slim matchable-corpus page for the substance showcases. Additive
    // across function rollout like the per-substance read it replaces: a
    // deployment that predates the query degrades to an empty done page (an
    // empty automatic pool) — and says so.
    getPublicMatchableReplicationPage: async (cursor) => {
      try {
        return await query<PublicMatchableReplicationPage, { cursor?: string; limit: number }>(
          publicDataReadCatalog.publicMatchableReplicationsPage.functionName,
          publicDataReadCatalog.publicMatchableReplicationsPage.args(cursor),
        );
      } catch (error) {
        if (isExplicitMissingPublicFunctionError(error)) {
          console.warn(
            "[publicData] substanceGalleries:getPublicMatchableReplicationsPage is not deployed; substance showcases degraded to empty.",
          );
          return { items: [], cursor: "", isDone: true };
        }
        throw error;
      }
    },
    // The stored curation row for one substance. `getBySubstance` is a
    // long-deployed public query, so no rollout degrade is needed here.
    getPublicSubstanceGalleryCuration: async (substanceSlug) => {
      const doc = await query<
        { curated_slugs: string[]; removed_slugs: string[]; carousel_order?: string[]; disabled?: boolean } | null,
        { substance_slug: string }
      >(
        publicDataReadCatalog.publicSubstanceGalleryCuration.functionName,
        publicDataReadCatalog.publicSubstanceGalleryCuration.args(substanceSlug),
      );
      if (!doc) return null;
      return {
        curated_slugs: doc.curated_slugs ?? [],
        removed_slugs: doc.removed_slugs ?? [],
        carousel_order: doc.carousel_order ?? [],
        disabled: doc.disabled ?? false,
      };
    },
    // A missing query or incomplete index must use the shared paged corpus.
    // Cached null means use that complete fallback, never an empty gallery.
    getPublicSubstanceGallery: async (substanceSlug) => {
      try {
        return await query<PublicSubstanceGallery, { substance_slug: string }>(
          publicDataReadCatalog.publicSubstanceGallery.functionName,
          publicDataReadCatalog.publicSubstanceGallery.args(substanceSlug),
        );
      } catch (error) {
        if (
          typeof error === "object" && error !== null && "data" in error &&
          typeof error.data === "object" && error.data !== null &&
          "code" in error.data && error.data.code === "SUBSTANCE_GALLERY_INDEX_NOT_READY"
        ) {
          return null;
        }
        if (isExplicitMissingPublicFunctionError(error)) {
          if (!hasWarnedAboutSubstanceGalleryRead) {
            hasWarnedAboutSubstanceGalleryRead = true;
            console.warn(
              "[publicData] substanceGalleries:getPublicGalleryBySubstance is not deployed; substance showcases fall back to the paged matchable corpus.",
            );
          }
          return null;
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
    getPublicMoleculeOverrideSummaries: () =>
      query<PublicMoleculeOverrideSummary[]>(publicDataReadCatalog.publicMoleculeOverrideSummaries.functionName, {}),
    getPublicMoleculeUpdatedAt: async (slug) => {
      const row = await query<PublicMoleculeOverrideSummary | null, { slug: string }>(
        publicDataReadCatalog.publicMoleculeMetadataBySlug.functionName,
        publicDataReadCatalog.publicMoleculeMetadataBySlug.args(slug),
      );
      return row?.updatedAt ?? null;
    },
    getPublicMoleculeBySlug: async (slug) => {
      const override = await query<PublicMolecule | null, { slug: string }>(
        publicDataReadCatalog.publicMoleculeBySlug.functionName,
        publicDataReadCatalog.publicMoleculeBySlug.args(slug),
      );
      return override ? { svg: override.svg, updatedAt: override.updatedAt } : null;
    },
    getPublicChangelogBySubmitters: (submitters, limit) =>
      query<PublicChangelogRow[], { submitters: string[]; limit: number }>(
        publicDataReadCatalog.publicChangelogBySubmitters.functionName,
        publicDataReadCatalog.publicChangelogBySubmitters.args(submitters, limit),
      ),
    getPublicChangelogByArticleSlug: (slug, limit) =>
      query<PublicChangelogRow[], { slug: string; limit: number }>(
        publicDataReadCatalog.publicChangelogByArticleSlug.functionName,
        publicDataReadCatalog.publicChangelogByArticleSlug.args(slug, limit),
      ),
    getPublicRecentChangelog: (limit) =>
      query<PublicChangelogRow[], { limit: number }>(
        publicDataReadCatalog.publicChangelogRecent.functionName,
        publicDataReadCatalog.publicChangelogRecent.args(limit),
      ),
    getPublicReplicationIdentityAttribution: (replicationId) =>
      query<PublicReplicationIdentityAttribution | null, { replication_id: string }>(
        publicDataReadCatalog.publicReplicationIdentityAttribution.functionName,
        publicDataReadCatalog.publicReplicationIdentityAttribution.args(replicationId),
      ),
    getPublicContributorIdentityByKey: (key) =>
      query<PublicContributorIdentity | null, { key: string }>(
        publicDataReadCatalog.publicContributorIdentityByKey.functionName,
        publicDataReadCatalog.publicContributorIdentityByKey.args(key),
      ),
    getPublicReagentTestBySlug: (slug) =>
      query<unknown, { slug: string }>(
        publicDataReadCatalog.publicReagentTestBySlug.functionName,
        publicDataReadCatalog.publicReagentTestBySlug.args(slug),
      ),
    getPublicCopyBlocks: () => query<unknown>(publicDataReadCatalog.publicCopyBlocks.functionName, {}),
    getPublicWarningBannerPresets: () =>
      query<unknown>(publicDataReadCatalog.publicWarningBannerPresets.functionName, {}),
    getPublicBannerDisplayConfig: () =>
      query<unknown>(publicDataReadCatalog.publicBannerDisplayConfig.functionName, {}),
  };
}

// Persist bounded corpus pages, never assembled multi-megabyte inputs.
// Full documents use smaller pages than slim library and route projections.
// Compositions above these leaves remain request-only to avoid nested bypass.
const readPublicSubstanceProjectionPage = publicDataCache(
  async (name: string, args: QueryArgs) => queryConvex<unknown, QueryArgs>(name, args),
  ["convex-public-substance-projection-page-v1"],
  {
    revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
    tags: [
      PUBLIC_CONVEX_CACHE_TAGS.all,
      PUBLIC_CONVEX_CACHE_TAGS.substances,
      PUBLIC_SUBSTANCE_LISTS_TAG,
    ],
  },
);

const queryDefaultPublicData: QueryTransport = async <
  Result,
  Args extends QueryArgs = Record<string, never>,
>(name: string, args: Args): Promise<Result> => {
  if (
    name === publicDataReadCatalog.publicSubstanceLibraryInput.functionName ||
    name === publicDataReadCatalog.publicSubstanceMechanismRouteInput.functionName ||
    name === publicDataReadCatalog.publicSubstanceCoverageInput.functionName ||
    name === publicDataReadCatalog.publicSubstanceFullDocuments.functionName
  ) {
    return await readPublicSubstanceProjectionPage(name, args) as Result;
  }
  return queryConvex<Result, Args>(name, args);
};

const defaultPublicDataReadAdapter = createConvexPublicDataReadAdapter(queryDefaultPublicData);

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
