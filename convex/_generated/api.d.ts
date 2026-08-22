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
import type * as articleSources from "../articleSources.js";
import type * as authorAttribution from "../authorAttribution.js";
import type * as bindingSiteMigration from "../bindingSiteMigration.js";
import type * as categoryLayout from "../categoryLayout.js";
import type * as changelog from "../changelog.js";
import type * as citationEvidence from "../citationEvidence.js";
import type * as contributorProfiles from "../contributorProfiles.js";
import type * as copyBlocks from "../copyBlocks.js";
import type * as effectIndexArchive from "../effectIndexArchive.js";
import type * as effectIndexArticles from "../effectIndexArticles.js";
import type * as indexLayouts from "../indexLayouts.js";
import type * as lib_adminIntentTokens from "../lib/adminIntentTokens.js";
import type * as lib_articleFieldWrites from "../lib/articleFieldWrites.js";
import type * as lib_articleReferenceAuthorWrites from "../lib/articleReferenceAuthorWrites.js";
import type * as lib_articleReferenceProvenanceWrites from "../lib/articleReferenceProvenanceWrites.js";
import type * as lib_articleReferenceWrites from "../lib/articleReferenceWrites.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_contentSchemaValidators from "../lib/contentSchemaValidators.js";
import type * as lib_contributorProfileMaterialization from "../lib/contributorProfileMaterialization.js";
import type * as lib_contributorProfileOrdering from "../lib/contributorProfileOrdering.js";
import type * as lib_contributorProfileOrderingHandlers from "../lib/contributorProfileOrderingHandlers.js";
import type * as lib_contributorProfilePatches from "../lib/contributorProfilePatches.js";
import type * as lib_contributorProfilePersistence from "../lib/contributorProfilePersistence.js";
import type * as lib_contributorProfileReadHandlers from "../lib/contributorProfileReadHandlers.js";
import type * as lib_contributorProfileWriteHandlers from "../lib/contributorProfileWriteHandlers.js";
import type * as lib_contributorProfiles from "../lib/contributorProfiles.js";
import type * as lib_effectIndexArchiveReadProjections from "../lib/effectIndexArchiveReadProjections.js";
import type * as lib_effectMediaSchemaValidators from "../lib/effectMediaSchemaValidators.js";
import type * as lib_generatedPublication from "../lib/generatedPublication.js";
import type * as lib_replicationDateValidators from "../lib/replicationDateValidators.js";
import type * as lib_replicationPolicy from "../lib/replicationPolicy.js";
import type * as lib_replicationReads from "../lib/replicationReads.js";
import type * as lib_replicationRecovery from "../lib/replicationRecovery.js";
import type * as lib_replicationStudio from "../lib/replicationStudio.js";
import type * as lib_replicationUrls from "../lib/replicationUrls.js";
import type * as lib_replicationValidators from "../lib/replicationValidators.js";
import type * as lib_replicationWrites from "../lib/replicationWrites.js";
import type * as lib_reviewFlags from "../lib/reviewFlags.js";
import type * as lib_subjectiveEffectReadProjections from "../lib/subjectiveEffectReadProjections.js";
import type * as lib_substanceEditorReadProjections from "../lib/substanceEditorReadProjections.js";
import type * as lib_substanceIngestion from "../lib/substanceIngestion.js";
import type * as lib_substancePreviewOrdering from "../lib/substancePreviewOrdering.js";
import type * as lib_substanceProjectionCore from "../lib/substanceProjectionCore.js";
import type * as lib_substanceProvenanceHandlers from "../lib/substanceProvenanceHandlers.js";
import type * as lib_substanceReadHandlers from "../lib/substanceReadHandlers.js";
import type * as lib_substanceReadProjections from "../lib/substanceReadProjections.js";
import type * as lib_substanceReviewHandlers from "../lib/substanceReviewHandlers.js";
import type * as lib_substanceWriteHandlers from "../lib/substanceWriteHandlers.js";
import type * as lib_tripReportAttribution from "../lib/tripReportAttribution.js";
import type * as lib_tripReportEditing from "../lib/tripReportEditing.js";
import type * as lib_validators from "../lib/validators.js";
import type * as memberships from "../memberships.js";
import type * as moleculeClassTemplates from "../moleculeClassTemplates.js";
import type * as moleculeOverrides from "../moleculeOverrides.js";
import type * as prompts from "../prompts.js";
import type * as quotes from "../quotes.js";
import type * as reagentTestContract from "../reagentTestContract.js";
import type * as reagentTests from "../reagentTests.js";
import type * as replicationDates from "../replicationDates.js";
import type * as replicationPlaylists from "../replicationPlaylists.js";
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
  articleSources: typeof articleSources;
  authorAttribution: typeof authorAttribution;
  bindingSiteMigration: typeof bindingSiteMigration;
  categoryLayout: typeof categoryLayout;
  changelog: typeof changelog;
  citationEvidence: typeof citationEvidence;
  contributorProfiles: typeof contributorProfiles;
  copyBlocks: typeof copyBlocks;
  effectIndexArchive: typeof effectIndexArchive;
  effectIndexArticles: typeof effectIndexArticles;
  indexLayouts: typeof indexLayouts;
  "lib/adminIntentTokens": typeof lib_adminIntentTokens;
  "lib/articleFieldWrites": typeof lib_articleFieldWrites;
  "lib/articleReferenceAuthorWrites": typeof lib_articleReferenceAuthorWrites;
  "lib/articleReferenceProvenanceWrites": typeof lib_articleReferenceProvenanceWrites;
  "lib/articleReferenceWrites": typeof lib_articleReferenceWrites;
  "lib/auth": typeof lib_auth;
  "lib/contentSchemaValidators": typeof lib_contentSchemaValidators;
  "lib/contributorProfileMaterialization": typeof lib_contributorProfileMaterialization;
  "lib/contributorProfileOrdering": typeof lib_contributorProfileOrdering;
  "lib/contributorProfileOrderingHandlers": typeof lib_contributorProfileOrderingHandlers;
  "lib/contributorProfilePatches": typeof lib_contributorProfilePatches;
  "lib/contributorProfilePersistence": typeof lib_contributorProfilePersistence;
  "lib/contributorProfileReadHandlers": typeof lib_contributorProfileReadHandlers;
  "lib/contributorProfileWriteHandlers": typeof lib_contributorProfileWriteHandlers;
  "lib/contributorProfiles": typeof lib_contributorProfiles;
  "lib/effectIndexArchiveReadProjections": typeof lib_effectIndexArchiveReadProjections;
  "lib/effectMediaSchemaValidators": typeof lib_effectMediaSchemaValidators;
  "lib/generatedPublication": typeof lib_generatedPublication;
  "lib/replicationDateValidators": typeof lib_replicationDateValidators;
  "lib/replicationPolicy": typeof lib_replicationPolicy;
  "lib/replicationReads": typeof lib_replicationReads;
  "lib/replicationRecovery": typeof lib_replicationRecovery;
  "lib/replicationStudio": typeof lib_replicationStudio;
  "lib/replicationUrls": typeof lib_replicationUrls;
  "lib/replicationValidators": typeof lib_replicationValidators;
  "lib/replicationWrites": typeof lib_replicationWrites;
  "lib/reviewFlags": typeof lib_reviewFlags;
  "lib/subjectiveEffectReadProjections": typeof lib_subjectiveEffectReadProjections;
  "lib/substanceEditorReadProjections": typeof lib_substanceEditorReadProjections;
  "lib/substanceIngestion": typeof lib_substanceIngestion;
  "lib/substancePreviewOrdering": typeof lib_substancePreviewOrdering;
  "lib/substanceProjectionCore": typeof lib_substanceProjectionCore;
  "lib/substanceProvenanceHandlers": typeof lib_substanceProvenanceHandlers;
  "lib/substanceReadHandlers": typeof lib_substanceReadHandlers;
  "lib/substanceReadProjections": typeof lib_substanceReadProjections;
  "lib/substanceReviewHandlers": typeof lib_substanceReviewHandlers;
  "lib/substanceWriteHandlers": typeof lib_substanceWriteHandlers;
  "lib/tripReportAttribution": typeof lib_tripReportAttribution;
  "lib/tripReportEditing": typeof lib_tripReportEditing;
  "lib/validators": typeof lib_validators;
  memberships: typeof memberships;
  moleculeClassTemplates: typeof moleculeClassTemplates;
  moleculeOverrides: typeof moleculeOverrides;
  prompts: typeof prompts;
  quotes: typeof quotes;
  reagentTestContract: typeof reagentTestContract;
  reagentTests: typeof reagentTests;
  replicationDates: typeof replicationDates;
  replicationPlaylists: typeof replicationPlaylists;
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

export declare const components: {};
