import type { IndexLayoutType } from "./publicData.shared";

const ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE = 64;
const PUBLIC_SUBSTANCE_PAGE_SIZE = 32;
const PUBLIC_SUBSTANCE_COVERAGE_PAGE_SIZE = 64;
const PUBLIC_SUBSTANCE_DOCUMENT_PAGE_SIZE = 4;
// Slug pages carry one string per article, so the item cap can sit far above
// the preview page size; the query bounds itself by article bytes read.
const PUBLIC_SUBSTANCE_SLUG_PAGE_SIZE = 160;
const PUBLIC_REPLICATION_GALLERY_PAGE_SIZE = 64;
const PUBLIC_MATCHABLE_REPLICATION_PAGE_SIZE = 256;
const PUBLIC_TRIP_REPORT_PAGE_SIZE = 32;

const publicSubstancePageArgs = (cursor?: string) => ({
  ...(cursor ? { cursor } : {}),
  limit: PUBLIC_SUBSTANCE_PAGE_SIZE,
});

/**
 * Canonical mapping from public read operations to their Postgres query names
 * and argument builders. Keeping this catalog separate makes the transport
 * adapter responsible only for orchestration, projection, and degradation.
 */
export const publicDataReadCatalog = {
  publicSubstanceLibraryInput: {
    functionName: "substanceIndex:getPublicLibraryInputPage",
    args: publicSubstancePageArgs,
  },
  publicSubstanceEffectMembershipInput: {
    functionName: "substanceIndex:getPublicLibraryInputPage",
    args: (cursor?: string) => ({ ...publicSubstancePageArgs(cursor), projection: "effect-membership" }),
  },
  publicSubstanceCoverageInput: {
    functionName: "substanceIndex:getPublicCoverageInputPage",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: PUBLIC_SUBSTANCE_COVERAGE_PAGE_SIZE,
    }),
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
  publicOverviewCounts: { functionName: "publicOverview:getCounts", args: () => ({}) },
  publicCategoryLayout: { functionName: "categoryLayout:get", args: () => ({}) },
  publicSubstanceDocumentsPage: {
    functionName: "substanceIndex:getPublicArticleTextInputPage",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: 4,
    }),
  },
  publicSubstanceLookup: {
    functionName: "substanceIndex:getPublicLookupPage",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: 200,
    }),
  },
  publicSubstanceLookupBySlug: {
    functionName: "substanceIndex:getPublicLookupBySlug",
    args: (slug: string) => ({ slug }),
  },
  publicSubstancePreviews: {
    functionName: "substanceIndex:getPublicPreviewsPage",
    args: publicSubstancePageArgs,
  },
  publicSubstanceSearchSummaries: {
    functionName: "substanceIndex:getPublicSearchSummariesPage",
    args: publicSubstancePageArgs,
  },
  publicSubstanceSlugs: {
    functionName: "substanceIndex:getPublicSlugsPage",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: PUBLIC_SUBSTANCE_SLUG_PAGE_SIZE,
    }),
  },
  publicSubstanceBySlug: { functionName: "substanceIndex:getPublicBySlug", args: (slug: string) => ({ slug }) },
  publicReviewedArticlesByContributor: {
    functionName: "substanceIndex:getPublicReviewedArticlesPage",
    args: (profileKey: string, cursor?: string) => ({
      profileKey,
      ...(cursor ? { cursor } : {}),
      limit: PUBLIC_SUBSTANCE_PAGE_SIZE,
    }),
  },
  publicReviewedArticleCredits: {
    functionName: "substanceIndex:getPublicReviewedArticleCreditsPage",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: PUBLIC_SUBSTANCE_PAGE_SIZE,
    }),
  },
  publicSubstanceFullDocuments: {
    functionName: "substanceIndex:getFullDocumentPage",
    args: (cursor: string | null) => ({
      paginationOpts: { cursor, numItems: PUBLIC_SUBSTANCE_DOCUMENT_PAGE_SIZE },
    }),
  },
  publicSubstanceSlugsByCandidates: {
    functionName: "substanceIndex:getPublicSlugsByCandidates",
    args: (candidates: string[]) => ({ candidates }),
  },
  publicEffectSlugs: { functionName: "subjectiveEffects:getPublicSlugs", args: () => ({}) },
  publicEffectRecords: { functionName: "subjectiveEffects:getPublicPreviews", args: () => ({}) },
  publicEffectIndex: { functionName: "subjectiveEffects:getPublicIndex", args: () => ({}) },
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
  publicReplicationGalleryMembership: {
    functionName: "replications:getPublicGalleryMembership",
    args: () => ({}),
  },
  publicReplicationGalleryPage: {
    functionName: "replications:getPublicGalleryPage",
    args: (cursor?: string, limit = PUBLIC_REPLICATION_GALLERY_PAGE_SIZE, effectSlug?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit,
      ...(effectSlug !== undefined ? { effectSlug } : {}),
    }),
  },
  publicReplicationArtistsByKeys: {
    functionName: "replicationTaxonomy:getPublicArtistsByKeys",
    args: (keys: string[]) => ({ keys }),
  },
  publicReplicationBySlug: {
    functionName: "replications:getBySlug",
    args: (slug: string) => ({ slug }),
  },
  publicReplicationsBySlugs: {
    functionName: "replications:getBySlugs",
    args: (slugs: string[]) => ({ slugs }),
  },
  publicReplicationsByArtistNames: {
    functionName: "replications:getByArtistNames",
    args: (artistNames: string[]) => ({ artistNames }),
  },
  publicReplicationsByArtistNamesPage: {
    functionName: "replications:getByArtistNamesPage",
    args: (artistNames: string[], cursor?: string) => ({
      artistNames,
      ...(cursor ? { cursor } : {}),
      limit: PUBLIC_REPLICATION_GALLERY_PAGE_SIZE,
    }),
  },
  publicMatchableReplicationsPage: {
    functionName: "substanceGalleries:getPublicMatchableReplicationsPage",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: PUBLIC_MATCHABLE_REPLICATION_PAGE_SIZE,
    }),
  },
  publicSubstanceGalleryCuration: {
    functionName: "substanceGalleries:getBySubstance",
    args: (substanceSlug: string) => ({ substance_slug: substanceSlug }),
  },
  publicSubstanceGallery: {
    functionName: "substanceGalleries:getPublicGalleryBySubstance",
    args: (substanceSlug: string) => ({ substance_slug: substanceSlug }),
  },
  publicTripReportPreviews: {
    functionName: "tripReports:getPublicBrowseIndex",
    args: () => ({}),
  },
  publicReportSearchSummaries: {
    functionName: "tripReports:getPublicPreviewsPage",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: PUBLIC_TRIP_REPORT_PAGE_SIZE,
      includeSearchSummary: true,
    }),
  },
  publicTripReportRecords: {
    functionName: "tripReports:getPublicDetailsPage",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: PUBLIC_TRIP_REPORT_PAGE_SIZE,
    }),
  },
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
  publicContributorIdentities: {
    functionName: "contributorProfiles:getPublicIdentities",
    args: (lookupKeys?: string[]) => lookupKeys ? { lookupKeys } : {},
  },
  publicAboutConfig: { functionName: "siteConfig:getAbout", args: () => ({}) },
  publicFeaturedReplications: {
    functionName: "siteConfig:getFeaturedReplications",
    args: () => ({}),
  },
  publicIndexLayoutByType: { functionName: "indexLayouts:getByType", args: (type: IndexLayoutType) => ({ type }) },
  publicMoleculeOverrideSummaries: { functionName: "moleculeOverrides:listSlugs", args: () => ({}) },
  publicMoleculeMetadataBySlug: { functionName: "moleculeOverrides:getMetadataBySlug", args: (slug: string) => ({ slug }) },
  publicMoleculeBySlug: { functionName: "moleculeOverrides:getBySlug", args: (slug: string) => ({ slug }) },
  publicChangelogBySubmitters: {
    functionName: "changelog:getBySubmitter",
    args: (submitters: string[], limit: number) => ({ submitters, limit }),
  },
  publicChangelogByArticleSlug: {
    functionName: "changelog:getByArticleSlug",
    args: (slug: string, limit: number) => ({ slug, limit }),
  },
  publicChangelogRecent: { functionName: "changelog:getRecent", args: (limit: number) => ({ limit }) },
  publicChangelogSummariesByArticleSlug: {
    functionName: "changelog:getByArticleSlugSummaries",
    args: (slug: string, limit: number) => ({ slug, limit }),
  },
  publicChangelogRecentSummaries: {
    functionName: "changelog:getRecentSummaries",
    args: (limit: number) => ({ limit }),
  },
  publicReplicationIdentityAttribution: {
    functionName: "publicReplicationIdentitySocial:getAttributionByReplicationId",
    args: (replicationId: string) => ({ replication_id: replicationId }),
  },
  publicContributorIdentityByKey: {
    functionName: "publicReplicationIdentitySocial:getProfileIdentityByKey",
    args: (key: string) => ({ key }),
  },
  publicReagentTestBySlug: { functionName: "reagentTests:getBySlug", args: (slug: string) => ({ slug }) },
  publicCopyBlocks: { functionName: "copyBlocks:getAll", args: () => ({}) },
  publicCopyBlocksByKeys: { functionName: "copyBlocks:getByKeys", args: (keys: string[]) => ({ keys }) },
  publicWarningBannerPresets: { functionName: "warningBanners:listPresets", args: () => ({}) },
  publicBannerDisplayConfig: { functionName: "siteConfig:getBannerDisplay", args: () => ({}) },
} as const;
