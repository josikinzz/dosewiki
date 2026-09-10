/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as articleFeedback from "../articleFeedback.js";
import type * as articleLifecycle from "../articleLifecycle.js";
import type * as articleSources from "../articleSources.js";
import type * as authorAttribution from "../authorAttribution.js";
import type * as bindingSiteMigration from "../bindingSiteMigration.js";
import type * as categoryLayout from "../categoryLayout.js";
import type * as changeProposalReview from "../changeProposalReview.js";
import type * as changeProposals from "../changeProposals.js";
import type * as changelog from "../changelog.js";
import type * as citationEvidence from "../citationEvidence.js";
import type * as contentRevisions from "../contentRevisions.js";
import type * as contributorProfileMerges from "../contributorProfileMerges.js";
import type * as contributorProfiles from "../contributorProfiles.js";
import type * as copyBlocks from "../copyBlocks.js";
import type * as crons from "../crons.js";
import type * as effectIndexArchive from "../effectIndexArchive.js";
import type * as effectIndexArticles from "../effectIndexArticles.js";
import type * as http from "../http.js";
import type * as indexLayouts from "../indexLayouts.js";
import type * as inviteCodes from "../inviteCodes.js";
import type * as lib_adminIntentTokens from "../lib/adminIntentTokens.js";
import type * as lib_articleFieldWrites from "../lib/articleFieldWrites.js";
import type * as lib_articleLifecycleValidation from "../lib/articleLifecycleValidation.js";
import type * as lib_articleReferenceAuthorWrites from "../lib/articleReferenceAuthorWrites.js";
import type * as lib_articleReferenceProvenanceWrites from "../lib/articleReferenceProvenanceWrites.js";
import type * as lib_articleReferenceWrites from "../lib/articleReferenceWrites.js";
import type * as lib_articleRevisionJournal from "../lib/articleRevisionJournal.js";
import type * as lib_auditStamp from "../lib/auditStamp.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_categoryLayoutMirror from "../lib/categoryLayoutMirror.js";
import type * as lib_changeProposalApply from "../lib/changeProposalApply.js";
import type * as lib_changeProposalDiff from "../lib/changeProposalDiff.js";
import type * as lib_changeProposalTargets from "../lib/changeProposalTargets.js";
import type * as lib_citationQueueFilter from "../lib/citationQueueFilter.js";
import type * as lib_contentRevisions from "../lib/contentRevisions.js";
import type * as lib_contentSchemaValidators from "../lib/contentSchemaValidators.js";
import type * as lib_contributorProfileImports from "../lib/contributorProfileImports.js";
import type * as lib_contributorProfileMaterialization from "../lib/contributorProfileMaterialization.js";
import type * as lib_contributorProfileMergeValidators from "../lib/contributorProfileMergeValidators.js";
import type * as lib_contributorProfileOrdering from "../lib/contributorProfileOrdering.js";
import type * as lib_contributorProfileOrderingHandlers from "../lib/contributorProfileOrderingHandlers.js";
import type * as lib_contributorProfilePatches from "../lib/contributorProfilePatches.js";
import type * as lib_contributorProfilePersistence from "../lib/contributorProfilePersistence.js";
import type * as lib_contributorProfileReadHandlers from "../lib/contributorProfileReadHandlers.js";
import type * as lib_contributorProfileWriteHandlers from "../lib/contributorProfileWriteHandlers.js";
import type * as lib_contributorProfiles from "../lib/contributorProfiles.js";
import type * as lib_copyIndexPublication from "../lib/copyIndexPublication.js";
import type * as lib_effectMediaSchemaValidators from "../lib/effectMediaSchemaValidators.js";
import type * as lib_generatedPublication from "../lib/generatedPublication.js";
import type * as lib_indexedMutation from "../lib/indexedMutation.js";
import type * as lib_narrativeRevisions from "../lib/narrativeRevisions.js";
import type * as lib_publicReadIndexBackfill from "../lib/publicReadIndexBackfill.js";
import type * as lib_publicReadIndexSchema from "../lib/publicReadIndexSchema.js";
import type * as lib_publicReadIndexes from "../lib/publicReadIndexes.js";
import type * as lib_publicationOutbox from "../lib/publicationOutbox.js";
import type * as lib_replicationAttribution from "../lib/replicationAttribution.js";
import type * as lib_replicationAttributionValidators from "../lib/replicationAttributionValidators.js";
import type * as lib_replicationDateValidators from "../lib/replicationDateValidators.js";
import type * as lib_replicationDuplicateReconciliation from "../lib/replicationDuplicateReconciliation.js";
import type * as lib_replicationDuplicateValidators from "../lib/replicationDuplicateValidators.js";
import type * as lib_replicationEditJournal from "../lib/replicationEditJournal.js";
import type * as lib_replicationGalleryReads from "../lib/replicationGalleryReads.js";
import type * as lib_replicationIdentitySocialValidators from "../lib/replicationIdentitySocialValidators.js";
import type * as lib_replicationPolicy from "../lib/replicationPolicy.js";
import type * as lib_replicationReads from "../lib/replicationReads.js";
import type * as lib_replicationRecovery from "../lib/replicationRecovery.js";
import type * as lib_replicationStudio from "../lib/replicationStudio.js";
import type * as lib_replicationTaxonomyCas from "../lib/replicationTaxonomyCas.js";
import type * as lib_replicationTaxonomyValidators from "../lib/replicationTaxonomyValidators.js";
import type * as lib_replicationUrls from "../lib/replicationUrls.js";
import type * as lib_replicationValidators from "../lib/replicationValidators.js";
import type * as lib_replicationWrites from "../lib/replicationWrites.js";
import type * as lib_reviewFlags from "../lib/reviewFlags.js";
import type * as lib_reviewedArticleIndexReads from "../lib/reviewedArticleIndexReads.js";
import type * as lib_saveRevalidationPaths from "../lib/saveRevalidationPaths.js";
import type * as lib_subjectiveEffectReadProjections from "../lib/subjectiveEffectReadProjections.js";
import type * as lib_substanceGalleryCurationReads from "../lib/substanceGalleryCurationReads.js";
import type * as lib_substanceGalleryPublicReads from "../lib/substanceGalleryPublicReads.js";
import type * as lib_substanceIngestion from "../lib/substanceIngestion.js";
import type * as lib_substanceProvenanceHandlers from "../lib/substanceProvenanceHandlers.js";
import type * as lib_substanceReadHandlers from "../lib/substanceReadHandlers.js";
import type * as lib_substanceReviewHandlers from "../lib/substanceReviewHandlers.js";
import type * as lib_substanceTagRegistryProjection from "../lib/substanceTagRegistryProjection.js";
import type * as lib_substanceWriteHandlers from "../lib/substanceWriteHandlers.js";
import type * as lib_tripReportAttribution from "../lib/tripReportAttribution.js";
import type * as lib_tripReportEditing from "../lib/tripReportEditing.js";
import type * as lib_tripReportOwnership from "../lib/tripReportOwnership.js";
import type * as lib_tripReportPublicProjection from "../lib/tripReportPublicProjection.js";
import type * as lib_tripReportSubstanceIndex from "../lib/tripReportSubstanceIndex.js";
import type * as lib_validators from "../lib/validators.js";
import type * as mailingList from "../mailingList.js";
import type * as memberships from "../memberships.js";
import type * as moleculeClassTemplates from "../moleculeClassTemplates.js";
import type * as moleculeOverrides from "../moleculeOverrides.js";
import type * as prompts from "../prompts.js";
import type * as publicReadIndexes from "../publicReadIndexes.js";
import type * as publicReplicationIdentitySocial from "../publicReplicationIdentitySocial.js";
import type * as publicationDelivery from "../publicationDelivery.js";
import type * as publicationRecovery from "../publicationRecovery.js";
import type * as quotes from "../quotes.js";
import type * as reagentTestContract from "../reagentTestContract.js";
import type * as reagentTests from "../reagentTests.js";
import type * as replicationAttribution from "../replicationAttribution.js";
import type * as replicationContextualEditing from "../replicationContextualEditing.js";
import type * as replicationDates from "../replicationDates.js";
import type * as replicationDuplicates from "../replicationDuplicates.js";
import type * as replicationIdentitySocial from "../replicationIdentitySocial.js";
import type * as replicationPlaylists from "../replicationPlaylists.js";
import type * as replicationTaxonomy from "../replicationTaxonomy.js";
import type * as replications from "../replications.js";
import type * as siteConfig from "../siteConfig.js";
import type * as siteFeedback from "../siteFeedback.js";
import type * as subjectiveEffects from "../subjectiveEffects.js";
import type * as substanceGalleries from "../substanceGalleries.js";
import type * as substanceIndex from "../substanceIndex.js";
import type * as tripReportContract from "../tripReportContract.js";
import type * as tripReportSubmissions from "../tripReportSubmissions.js";
import type * as tripReports from "../tripReports.js";
import type * as warningBanners from "../warningBanners.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  articleFeedback: typeof articleFeedback;
  articleLifecycle: typeof articleLifecycle;
  articleSources: typeof articleSources;
  authorAttribution: typeof authorAttribution;
  bindingSiteMigration: typeof bindingSiteMigration;
  categoryLayout: typeof categoryLayout;
  changeProposalReview: typeof changeProposalReview;
  changeProposals: typeof changeProposals;
  changelog: typeof changelog;
  citationEvidence: typeof citationEvidence;
  contentRevisions: typeof contentRevisions;
  contributorProfileMerges: typeof contributorProfileMerges;
  contributorProfiles: typeof contributorProfiles;
  copyBlocks: typeof copyBlocks;
  crons: typeof crons;
  effectIndexArchive: typeof effectIndexArchive;
  effectIndexArticles: typeof effectIndexArticles;
  http: typeof http;
  indexLayouts: typeof indexLayouts;
  inviteCodes: typeof inviteCodes;
  "lib/adminIntentTokens": typeof lib_adminIntentTokens;
  "lib/articleFieldWrites": typeof lib_articleFieldWrites;
  "lib/articleLifecycleValidation": typeof lib_articleLifecycleValidation;
  "lib/articleReferenceAuthorWrites": typeof lib_articleReferenceAuthorWrites;
  "lib/articleReferenceProvenanceWrites": typeof lib_articleReferenceProvenanceWrites;
  "lib/articleReferenceWrites": typeof lib_articleReferenceWrites;
  "lib/articleRevisionJournal": typeof lib_articleRevisionJournal;
  "lib/auditStamp": typeof lib_auditStamp;
  "lib/auth": typeof lib_auth;
  "lib/categoryLayoutMirror": typeof lib_categoryLayoutMirror;
  "lib/changeProposalApply": typeof lib_changeProposalApply;
  "lib/changeProposalDiff": typeof lib_changeProposalDiff;
  "lib/changeProposalTargets": typeof lib_changeProposalTargets;
  "lib/citationQueueFilter": typeof lib_citationQueueFilter;
  "lib/contentRevisions": typeof lib_contentRevisions;
  "lib/contentSchemaValidators": typeof lib_contentSchemaValidators;
  "lib/contributorProfileImports": typeof lib_contributorProfileImports;
  "lib/contributorProfileMaterialization": typeof lib_contributorProfileMaterialization;
  "lib/contributorProfileMergeValidators": typeof lib_contributorProfileMergeValidators;
  "lib/contributorProfileOrdering": typeof lib_contributorProfileOrdering;
  "lib/contributorProfileOrderingHandlers": typeof lib_contributorProfileOrderingHandlers;
  "lib/contributorProfilePatches": typeof lib_contributorProfilePatches;
  "lib/contributorProfilePersistence": typeof lib_contributorProfilePersistence;
  "lib/contributorProfileReadHandlers": typeof lib_contributorProfileReadHandlers;
  "lib/contributorProfileWriteHandlers": typeof lib_contributorProfileWriteHandlers;
  "lib/contributorProfiles": typeof lib_contributorProfiles;
  "lib/copyIndexPublication": typeof lib_copyIndexPublication;
  "lib/effectMediaSchemaValidators": typeof lib_effectMediaSchemaValidators;
  "lib/generatedPublication": typeof lib_generatedPublication;
  "lib/indexedMutation": typeof lib_indexedMutation;
  "lib/narrativeRevisions": typeof lib_narrativeRevisions;
  "lib/publicReadIndexBackfill": typeof lib_publicReadIndexBackfill;
  "lib/publicReadIndexSchema": typeof lib_publicReadIndexSchema;
  "lib/publicReadIndexes": typeof lib_publicReadIndexes;
  "lib/publicationOutbox": typeof lib_publicationOutbox;
  "lib/replicationAttribution": typeof lib_replicationAttribution;
  "lib/replicationAttributionValidators": typeof lib_replicationAttributionValidators;
  "lib/replicationDateValidators": typeof lib_replicationDateValidators;
  "lib/replicationDuplicateReconciliation": typeof lib_replicationDuplicateReconciliation;
  "lib/replicationDuplicateValidators": typeof lib_replicationDuplicateValidators;
  "lib/replicationEditJournal": typeof lib_replicationEditJournal;
  "lib/replicationGalleryReads": typeof lib_replicationGalleryReads;
  "lib/replicationIdentitySocialValidators": typeof lib_replicationIdentitySocialValidators;
  "lib/replicationPolicy": typeof lib_replicationPolicy;
  "lib/replicationReads": typeof lib_replicationReads;
  "lib/replicationRecovery": typeof lib_replicationRecovery;
  "lib/replicationStudio": typeof lib_replicationStudio;
  "lib/replicationTaxonomyCas": typeof lib_replicationTaxonomyCas;
  "lib/replicationTaxonomyValidators": typeof lib_replicationTaxonomyValidators;
  "lib/replicationUrls": typeof lib_replicationUrls;
  "lib/replicationValidators": typeof lib_replicationValidators;
  "lib/replicationWrites": typeof lib_replicationWrites;
  "lib/reviewFlags": typeof lib_reviewFlags;
  "lib/reviewedArticleIndexReads": typeof lib_reviewedArticleIndexReads;
  "lib/saveRevalidationPaths": typeof lib_saveRevalidationPaths;
  "lib/subjectiveEffectReadProjections": typeof lib_subjectiveEffectReadProjections;
  "lib/substanceGalleryCurationReads": typeof lib_substanceGalleryCurationReads;
  "lib/substanceGalleryPublicReads": typeof lib_substanceGalleryPublicReads;
  "lib/substanceIngestion": typeof lib_substanceIngestion;
  "lib/substanceProvenanceHandlers": typeof lib_substanceProvenanceHandlers;
  "lib/substanceReadHandlers": typeof lib_substanceReadHandlers;
  "lib/substanceReviewHandlers": typeof lib_substanceReviewHandlers;
  "lib/substanceTagRegistryProjection": typeof lib_substanceTagRegistryProjection;
  "lib/substanceWriteHandlers": typeof lib_substanceWriteHandlers;
  "lib/tripReportAttribution": typeof lib_tripReportAttribution;
  "lib/tripReportEditing": typeof lib_tripReportEditing;
  "lib/tripReportOwnership": typeof lib_tripReportOwnership;
  "lib/tripReportPublicProjection": typeof lib_tripReportPublicProjection;
  "lib/tripReportSubstanceIndex": typeof lib_tripReportSubstanceIndex;
  "lib/validators": typeof lib_validators;
  mailingList: typeof mailingList;
  memberships: typeof memberships;
  moleculeClassTemplates: typeof moleculeClassTemplates;
  moleculeOverrides: typeof moleculeOverrides;
  prompts: typeof prompts;
  publicReadIndexes: typeof publicReadIndexes;
  publicReplicationIdentitySocial: typeof publicReplicationIdentitySocial;
  publicationDelivery: typeof publicationDelivery;
  publicationRecovery: typeof publicationRecovery;
  quotes: typeof quotes;
  reagentTestContract: typeof reagentTestContract;
  reagentTests: typeof reagentTests;
  replicationAttribution: typeof replicationAttribution;
  replicationContextualEditing: typeof replicationContextualEditing;
  replicationDates: typeof replicationDates;
  replicationDuplicates: typeof replicationDuplicates;
  replicationIdentitySocial: typeof replicationIdentitySocial;
  replicationPlaylists: typeof replicationPlaylists;
  replicationTaxonomy: typeof replicationTaxonomy;
  replications: typeof replications;
  siteConfig: typeof siteConfig;
  siteFeedback: typeof siteFeedback;
  subjectiveEffects: typeof subjectiveEffects;
  substanceGalleries: typeof substanceGalleries;
  substanceIndex: typeof substanceIndex;
  tripReportContract: typeof tripReportContract;
  tripReportSubmissions: typeof tripReportSubmissions;
  tripReports: typeof tripReports;
  warningBanners: typeof warningBanners;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
