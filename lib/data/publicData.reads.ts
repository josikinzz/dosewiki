import "server-only";

import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { SubstanceEffectMembershipInput } from "../../src/data/projections/substanceReadProjections";
import type { SubstanceSearchSummaryProjection as SubstanceSearchSummary } from "../../src/data/projections/substanceReadProjections";
import type { PublicOverviewCounts } from "./publicData.shared";
import type { PublicChangelogSummary } from "../changelog/publicChangelogSummary";
import type { CoverageRow } from "../../src/features/coverage/coverageModel";
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
  type AboutConfigRecord,
  type IndexLayoutRecord,
  type IndexLayoutType,
  type PublicCategoryLayout,
  type PublicEffectArticle,
  type PublicEffectSummary,
  type PublicEffectIndexArticle,
  type PublicEffectPreview,
  type PublicEffectIndexEntry,
  type PublicPublicationIndexEntry,
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
  type SubjectiveEffectDetailRecord,
  type SubjectiveEffectRecord,
  type TripReportDetailRecord,
  type TripReportRecord,
} from "./publicData.shared";
import {
  type PublicSubstanceArticleRecord,
  parsePublicSubstanceLibraryInputRecords,
} from "./publicData.substanceContract";
import { queryData } from "./serverClient";
import { normalizeVCodeContent } from "../../src/features/effects/vcode/normalize";
import { normalizePublicEffectIndexArticle } from "./publicData.publicationProjection";
import {
  projectPublicEffectIndexPost,
  projectPublicEffectIndexPosts,
  type PublicEffectIndexPost,
} from "../../src/data/projections/effectIndexArchiveProjections";
import { publicDataReadCatalog } from "./publicData.readCatalog";
import {
  drainDataPaginationPages,
  drainPublicCorpusPages,
  queryPaginatedPublicProjectionRead,
  visitPublicCorpusPages,
  type QueryArgs,
  type QueryTransport,
} from "./publicData.pagination";
import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "./publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS, PUBLIC_SUBSTANCE_CONTENT_TAG, PUBLIC_SUBSTANCE_DOCUMENTS_TAG } from "./publicData.cacheTags";
import {
  normalizePublicEffectArticle,
  normalizePublicEffectArticles,
  normalizePublicEffectIndexArticles,
  parsePublicSubstanceRecordWithoutProvenance,
  parsePublicSubstanceRecordsWithoutProvenance,
  projectPublicEffectIndex,
  projectPublicEffectPreview,
  projectPublicEffectPreviews,
} from "./publicData.readProjections";

export {
  projectPublicEffectPreviews,
  projectPublicSubstanceLibraryRecord,
  projectPublicSubstancePreviews,
  projectPublicSubstanceRecord,
} from "./publicData.readProjections";


const ABOUT_PREVIEW_COUNT = 12;
const ABOUT_PREVIEW_MAX_PAGES = 128;
const ABOUT_PREVIEW_MAX_ROWS = 8_192;

export type PublicFullSubstanceDocument = Record<string, unknown>;

type PublicGalleryReplicationPage = {
  items: PublicGalleryReplicationPreview[];
  cursor: string;
  isDone: boolean;
}

type PublicMatchableReplicationPage = {
  items: SubstanceGalleryMatchableRow[];
  cursor: string;
  isDone: boolean;
}

type PublicSubstanceGalleryCuration = {
  curated_slugs: string[];
  removed_slugs: string[];
  carousel_order: string[];
  disabled?: boolean;
}

export type PublicDataReadAdapter = {
  getPublicOverviewCounts(): Promise<PublicOverviewCounts>;
  getRawSubstances(): Promise<PublicSubstanceLibraryRecord[]>;
  getPublicEffectMembershipInput(): Promise<PublicSubstanceLibraryRecord[]>;
  getPublicCoverageSubstances(): Promise<CoverageRow[]>;
  getPublicSubstanceDocuments(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicTranslationSubstanceDocuments?(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicMechanismRouteInput(): Promise<PublicMechanismRouteInput[]>;
  getPublicAboutPreviewSubstances(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicCategoryLayout(): Promise<PublicCategoryLayout | null>;
  getPublicSubstanceLookup(): Promise<PublicSubstanceLookupEntry[]>;
  getPublicSubstanceLookupBySlug(slug: string): Promise<Pick<PublicSubstanceLookupEntry, "slug" | "name"> | null>;
  getPublicSubstancePreviews(): Promise<PublicSubstancePreview[]>;
  getPublicSubstanceSearchSummaries(): Promise<SubstanceSearchSummary[]>;
  getPublicSubstanceSlugs(): Promise<string[]>;
  getPublicSubstanceSlugsByCandidates(slugs: string[]): Promise<string[]>;
  getPublicEffectSlugs(): Promise<string[]>;
  getPublicSubstanceBySlug(slug: string): Promise<PublicSubstanceRecord | null>;
  getPublicReviewedArticlesByContributor(profileKey: string): Promise<ContributorReviewedArticle[]>;
  getPublicReviewedArticleCredits(): Promise<ReviewedArticleCredit[]>;
  getPublicFullSubstanceDocuments(): Promise<PublicFullSubstanceDocument[]>;
  getPublicEffects(): Promise<PublicEffectPreview[]>;
  getPublicEffectIndex(): Promise<PublicEffectIndexEntry[]>;
  getPublicEffectBySlug(slug: string): Promise<SubjectiveEffectDetailRecord | null>;
  getPublicEffectArticles(): Promise<PublicEffectArticle[]>;
  getPublicEffectSummariesBySlugs(slugs: string[]): Promise<PublicEffectSummary[]>;
  getPublicEffectAudioIndex(): Promise<Pick<PublicEffectArticle, "slug" | "name" | "audio_replications">[]>;
  getPublicEffectContributorCredits(names?: string[]): Promise<Pick<PublicEffectArticle, "slug" | "name" | "contributors">[]>;
  getPublicEffectsByCategory(category: string): Promise<PublicEffectPreview[]>;
  getPublicEffectIndexArticles(): Promise<PublicEffectIndexArticle[]>;
  getPublishedEffectIndexArticles(): Promise<PublicEffectIndexArticle[]>;
  getPublishedPublicationIndex(kind: "article" | "blog"): Promise<PublicPublicationIndexEntry[]>;
  getPublicEffectIndexArticleBySlug(slug: string): Promise<PublicEffectIndexArticle | null>;
  getPublicEffectIndexPosts(): Promise<PublicEffectIndexPost[]>;
  getPublicEffectIndexPostBySlug(slug: string): Promise<PublicEffectIndexPost | null>;
  getPublicArtistCreditRows(): Promise<Pick<PublicGalleryReplicationPreview, "artist" | "artist_url" | "effect_slug" | "url">[]>;
  getPublicReplications(): Promise<GalleryReplication[]>;
  getPublicGalleryReplicationPage(cursor?: string, limit?: number, effectSlug?: string): Promise<PublicGalleryReplicationPage>;
  getPublicGalleryMembershipRows(): Promise<PublicGalleryReplicationPreview[]>;
  getPublicReplicationArtistsByKeys(keys: string[]): Promise<PublicReplicationArtistTaxonomy[]>;
  getPublicReplicationBySlug(slug: string): Promise<ReplicationWithUrl | null>;
  getPublicReplicationsBySlugs(slugs: string[]): Promise<ReplicationWithUrl[]>;
  getPublicReplicationsByArtistNames(artistNames: string[]): Promise<ReplicationWithUrl[]>;
  getPublicMatchableReplicationPage(cursor?: string): Promise<PublicMatchableReplicationPage>;
  getPublicSubstanceGalleryCuration(substanceSlug: string): Promise<PublicSubstanceGalleryCuration | null>;
  getPublicSubstanceGallery(substanceSlug: string): Promise<PublicSubstanceGallery | null>;
  getPublicTripReportPreviews(): Promise<TripReportRecord[]>;
  getPublicReportSearchSummaries(): Promise<Array<{ slug: string; title: string; introduction?: string }>>;
  getPublicTripReportRecords(): Promise<TripReportDetailRecord[]>;
  getPublicTripReportBySlug(slug: string): Promise<TripReportDetailRecord | null>;
  getPublicTripReportsByAuthor(authorName: string): Promise<TripReportDetailRecord[]>;
  getPublicTripReportsByContributor(profileKey: string, authorNames: string[]): Promise<TripReportDetailRecord[]>;
  getPublicTripReportsBySubstanceNames(substanceNames: string[]): Promise<TripReportRecord[]>;
  getPublicContributorProfiles(): Promise<NormalizedUserProfile[]>;
  getPublicContributorIdentities(): Promise<NormalizedUserProfile[]>;
  getPublicContributorByKey(key: string): Promise<NormalizedUserProfile | null>;
  getPublicAboutConfig(): Promise<AboutConfigRecord | null>;
  getPublicFeaturedReplicationSlugs(): Promise<string[] | null>;
  getPublicIndexLayoutByType(type: IndexLayoutType): Promise<IndexLayoutRecord | null>;
  getPublicMoleculeOverrideSummaries(): Promise<PublicMoleculeOverrideSummary[]>;
  getPublicMoleculeUpdatedAt(slug: string): Promise<string | null>;
  getPublicMoleculeBySlug(slug: string): Promise<PublicMolecule | null>;
  getPublicChangelogBySubmitters(submitters: string[], limit: number): Promise<PublicChangelogRow[]>;
  getPublicChangelogByArticleSlug(slug: string, limit: number): Promise<PublicChangelogRow[]>;
  getPublicRecentChangelog(limit: number): Promise<PublicChangelogRow[]>;
  getPublicChangelogSummariesByArticleSlug(slug: string, limit: number): Promise<PublicChangelogSummary[]>;
  getPublicRecentChangelogSummaries(limit: number): Promise<PublicChangelogSummary[]>;
  getPublicChangelogById(entryId: string): Promise<PublicChangelogRow | null>;
  getPublicReplicationIdentityAttribution(replicationId: string): Promise<PublicReplicationIdentityAttribution | null>;
  getPublicContributorIdentityByKey(key: string): Promise<PublicContributorIdentity | null>;
  getPublicReagentTestBySlug(slug: string): Promise<unknown>;
  getPublicCopyBlocks(): Promise<unknown>;
  getPublicCopyBlocksByKeys(keys: string[]): Promise<unknown[]>;
  getPublicWarningBannerPresets(): Promise<unknown>;
  getPublicBannerDisplayConfig(): Promise<unknown>;
};

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

export function createDataPublicDataReadAdapter(query: QueryTransport = queryData): PublicDataReadAdapter {
  return {
    getPublicOverviewCounts: () =>
      query<PublicOverviewCounts>(publicDataReadCatalog.publicOverviewCounts.functionName, {}),
    getRawSubstances: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstanceLibraryInput,
        parsePublicSubstanceLibraryInputRecords,
      ),
    getPublicEffectMembershipInput: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstanceEffectMembershipInput,
        (records: SubstanceEffectMembershipInput[]) => parsePublicSubstanceLibraryInputRecords(records.map(record => ({
          ...record,
          summary: "",
          dosage: { routes: [] },
          duration: { routes: [] },
          harm_potential: {},
          references: [],
          interactions: { dangerous: [], unsafe: [], caution: [] },
          citations: [],
          expert_reviewed: false,
        }))),
      ),
    getPublicSubstanceDocuments: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstanceDocumentsPage,
        parsePublicSubstanceRecordsWithoutProvenance,
      ),
    getPublicTranslationSubstanceDocuments: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicTranslationSubstanceDocumentsPage,
        parsePublicSubstanceRecordsWithoutProvenance,
      ),
    getPublicCoverageSubstances: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstanceCoverageInput,
        (records: CoverageRow[]) => records,
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
    getPublicSubstanceLookupBySlug: (slug) =>
      query<Pick<PublicSubstanceLookupEntry, "slug" | "name"> | null, { slug: string }>(
        publicDataReadCatalog.publicSubstanceLookupBySlug.functionName,
        publicDataReadCatalog.publicSubstanceLookupBySlug.args(slug),
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
    getPublicSubstanceSearchSummaries: () =>
      queryPaginatedPublicProjectionRead(
        query,
        publicDataReadCatalog.publicSubstanceSearchSummaries,
        (entries: SubstanceSearchSummary[]) => entries,
      ),
    getPublicSubstanceSlugsByCandidates: (slugs) =>
      query<string[], { candidates: string[] }>(
        publicDataReadCatalog.publicSubstanceSlugsByCandidates.functionName,
        publicDataReadCatalog.publicSubstanceSlugsByCandidates.args(slugs),
      ),
    getPublicEffectSlugs: () =>
      query<string[]>(publicDataReadCatalog.publicEffectSlugs.functionName, {}),
    getPublicSubstanceSlugs: async () => {
      const slugs = await drainPublicCorpusPages<string>(
        query,
        publicDataReadCatalog.publicSubstanceSlugs,
      );
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
      drainDataPaginationPages<PublicFullSubstanceDocument>(
        query,
        publicDataReadCatalog.publicSubstanceFullDocuments,
      ),
    getPublicReviewedArticlesByContributor: (profileKey) =>
      drainPublicCorpusPages<ContributorReviewedArticle>(query, {
        functionName:
          publicDataReadCatalog.publicReviewedArticlesByContributor.functionName,
        args: (cursor) =>
          publicDataReadCatalog.publicReviewedArticlesByContributor.args(profileKey, cursor),
      }),
    getPublicReviewedArticleCredits: () =>
      drainPublicCorpusPages<ReviewedArticleCredit>(query, {
        functionName: publicDataReadCatalog.publicReviewedArticleCredits.functionName,
        args: (cursor) => publicDataReadCatalog.publicReviewedArticleCredits.args(cursor),
      }),
    getPublicEffects: async () =>
      projectPublicEffectPreviews(
        await query<SubjectiveEffectRecord[]>(
          publicDataReadCatalog.publicEffectRecords.functionName,
          publicDataReadCatalog.publicEffectRecords.args(),
        ),
      ),
    getPublicEffectIndex: async () =>
      projectPublicEffectIndex(
        await query<PublicEffectIndexEntry[]>(
          publicDataReadCatalog.publicEffectIndex.functionName,
          publicDataReadCatalog.publicEffectIndex.args(),
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
    getPublicEffectSummariesBySlugs: async (slugs) => {
      if (slugs.length === 0) return [];
      const rows = await query<PublicEffectSummary[], { slugs: string[] }>(
        "subjectiveEffects:getPublicSummariesBySlugs", { slugs },
      );
      return rows.map((row) => ({
        ...row,
        long_summary_ast: normalizeVCodeContent(row.long_summary_ast, row.long_summary_raw),
      }));
    },
    getPublicEffectAudioIndex: () => query("subjectiveEffects:getPublicAudioIndex", {}),
    getPublicEffectContributorCredits: (names) => query("subjectiveEffects:getPublicContributorCredits", names ? { names } : {}),
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
    getPublishedPublicationIndex: (kind) => query("effectIndexArticles:getPublishedIndex", { kind }),
    getPublicArtistCreditRows: () => query("publicArtistCredits:getRows", {}),
    getPublicReplications: async () =>
      drainPublicCorpusPages<GalleryReplication>(
        query,
        publicDataReadCatalog.publicReplicationGalleryPage,
      ),
    getPublicGalleryMembershipRows: () =>
      query<PublicGalleryReplicationPreview[]>(
        publicDataReadCatalog.publicReplicationGalleryMembership.functionName,
        {},
      ),
    getPublicGalleryReplicationPage: (cursor, limit = 64, effectSlug) =>
      query<PublicGalleryReplicationPage, { cursor?: string; limit: number; effectSlug?: string }>(
        publicDataReadCatalog.publicReplicationGalleryPage.functionName,
        publicDataReadCatalog.publicReplicationGalleryPage.args(cursor, limit, effectSlug),
      ),
    getPublicReplicationArtistsByKeys: async (keys) => {
      if (keys.length === 0) return [];
      return query<PublicReplicationArtistTaxonomy[], { keys: string[] }>(
        publicDataReadCatalog.publicReplicationArtistsByKeys.functionName,
        publicDataReadCatalog.publicReplicationArtistsByKeys.args(keys),
      );
    },
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
    getPublicReplicationsByArtistNames: (artistNames) =>
      drainPublicCorpusPages<ReplicationWithUrl>(query, {
        functionName:
          publicDataReadCatalog.publicReplicationsByArtistNamesPage.functionName,
        args: (cursor) =>
          publicDataReadCatalog.publicReplicationsByArtistNamesPage.args(
            artistNames,
            cursor,
          ),
      }),
    getPublicMatchableReplicationPage: (cursor) =>
      query<PublicMatchableReplicationPage, { cursor?: string; limit: number }>(
        publicDataReadCatalog.publicMatchableReplicationsPage.functionName,
        publicDataReadCatalog.publicMatchableReplicationsPage.args(cursor),
      ),
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
        throw error;
      }
    },
    getPublicTripReportPreviews: () =>
      query<TripReportRecord[]>(
        publicDataReadCatalog.publicTripReportPreviews.functionName,
        publicDataReadCatalog.publicTripReportPreviews.args(),
      ),
    getPublicReportSearchSummaries: () =>
      drainPublicCorpusPages<{ slug: string; title: string; introduction?: string }>(
        query,
        publicDataReadCatalog.publicReportSearchSummaries,
      ),
    getPublicTripReportRecords: () =>
      drainPublicCorpusPages<TripReportDetailRecord>(
        query,
        publicDataReadCatalog.publicTripReportRecords,
      ),
    getPublicTripReportBySlug: (slug) =>
      query<TripReportDetailRecord | null, { slug: string }>(
        publicDataReadCatalog.publicTripReportBySlug.functionName,
        publicDataReadCatalog.publicTripReportBySlug.args(slug),
      ),
    getPublicTripReportsByAuthor: (authorName) =>
      query<TripReportDetailRecord[], { authorName: string }>(
        publicDataReadCatalog.publicTripReportsByAuthor.functionName,
        publicDataReadCatalog.publicTripReportsByAuthor.args(authorName),
      ),
    getPublicTripReportsByContributor: (profileKey, authorNames) =>
      query<TripReportDetailRecord[], { profileKey: string; authorNames: string[] }>(
        publicDataReadCatalog.publicTripReportsByContributor.functionName,
        publicDataReadCatalog.publicTripReportsByContributor.args(profileKey, authorNames),
      ),
    getPublicTripReportsBySubstanceNames: (substanceNames) =>
      query<TripReportRecord[], { substanceNames: string[] }>(
        publicDataReadCatalog.publicTripReportsBySubstanceNames.functionName,
        publicDataReadCatalog.publicTripReportsBySubstanceNames.args(substanceNames),
      ),
    getPublicContributorProfiles: () =>
      query<NormalizedUserProfile[]>(publicDataReadCatalog.publicContributorProfiles.functionName, {}),
    getPublicContributorIdentities: () => query("contributorProfiles:getPublicIdentities", {}),
    getPublicContributorByKey: (key) => query("contributorProfiles:getByKey", { key }),
    getPublicChangelogById: (entryId) => query("changelog:getByEntryId", { entryId }),
    getPublicAboutConfig: () => query<AboutConfigRecord | null>(publicDataReadCatalog.publicAboutConfig.functionName, {}),
    getPublicFeaturedReplicationSlugs: async () => {
      const config = await query<{ slugs: string[] } | null>(
        publicDataReadCatalog.publicFeaturedReplications.functionName,
        {},
      );
      return config?.slugs ?? null;
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
    getPublicChangelogSummariesByArticleSlug: (slug, limit) =>
      query<PublicChangelogSummary[], { slug: string; limit: number }>(
        publicDataReadCatalog.publicChangelogSummariesByArticleSlug.functionName,
        publicDataReadCatalog.publicChangelogSummariesByArticleSlug.args(slug, limit),
      ),
    getPublicRecentChangelogSummaries: (limit) =>
      query<PublicChangelogSummary[], { limit: number }>(
        publicDataReadCatalog.publicChangelogRecentSummaries.functionName,
        publicDataReadCatalog.publicChangelogRecentSummaries.args(limit),
      ),
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
    getPublicCopyBlocksByKeys: (keys) =>
      query<unknown[], { keys: string[] }>(
        publicDataReadCatalog.publicCopyBlocksByKeys.functionName,
        publicDataReadCatalog.publicCopyBlocksByKeys.args(keys),
      ),
    getPublicWarningBannerPresets: () =>
      query<unknown>(publicDataReadCatalog.publicWarningBannerPresets.functionName, {}),
    getPublicBannerDisplayConfig: () =>
      query<unknown>(publicDataReadCatalog.publicBannerDisplayConfig.functionName, {}),
  };
}

const readPublicSubstanceProjectionPage = publicDataCache(
  async (name: string, args: QueryArgs) => queryData<unknown, QueryArgs>(name, args),
  ["data-public-substance-projection-page-v1"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    awaitRefresh: true,
    tags: (name) => [
      PUBLIC_DATA_CACHE_TAGS.all,
      PUBLIC_DATA_CACHE_TAGS.substances,
      name === publicDataReadCatalog.publicSubstanceCoverageInput.functionName ||
      name === publicDataReadCatalog.publicSubstanceFullDocuments.functionName
        ? PUBLIC_SUBSTANCE_DOCUMENTS_TAG
        : PUBLIC_SUBSTANCE_CONTENT_TAG,
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
  return queryData<Result, Args>(name, args);
};

const defaultPublicDataReadAdapter = createDataPublicDataReadAdapter(queryDefaultPublicData);

let publicDataReadAdapter: PublicDataReadAdapter = defaultPublicDataReadAdapter;

export function getPublicDataReadAdapter(): PublicDataReadAdapter {
  return publicDataReadAdapter;
}

export function setPublicDataReadAdapterForTest(adapter: PublicDataReadAdapter) {
  publicDataReadAdapter = adapter;
}
