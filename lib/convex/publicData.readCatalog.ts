import type { IndexLayoutType } from "./publicData.shared";

const ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE = 64;
const PUBLIC_SUBSTANCE_PAGE_SIZE = 32;

const publicSubstancePageArgs = (cursor?: string) => ({
  ...(cursor ? { cursor } : {}),
  limit: PUBLIC_SUBSTANCE_PAGE_SIZE,
});

/**
 * Canonical mapping from public read operations to their Convex query names
 * and argument builders. Keeping this catalog separate makes the transport
 * adapter responsible only for orchestration, projection, and degradation.
 */
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
      paginationOpts: { cursor, numItems: PUBLIC_SUBSTANCE_PAGE_SIZE },
    }),
  },
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
  publicReplicationArtistsByKeys: {
    functionName: "replicationTaxonomy:getPublicArtistsByKeys",
    args: (keys: string[]) => ({ keys }),
  },
  publicReplicationBySlug: {
    functionName: "replications:getBySlug",
    args: (slug: string) => ({ slug }),
  },
  publicReplicationsByArtistNames: {
    functionName: "replications:getByArtistNames",
    args: (artistNames: string[]) => ({ artistNames }),
  },
  publicReplicationsForSubstance: {
    functionName: "substanceGalleries:getPublicReplicationsForSubstance",
    args: (substanceSlug: string) => ({ substance_slug: substanceSlug }),
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
  publicFeaturedReplications: {
    functionName: "siteConfig:getFeaturedReplications",
    args: () => ({}),
  },
  publicIndexLayoutByType: { functionName: "indexLayouts:getByType", args: (type: IndexLayoutType) => ({ type }) },
} as const;
