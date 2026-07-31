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
import type * as categoryLayout from "../categoryLayout.js";
import type * as changelog from "../changelog.js";
import type * as citationEvidence from "../citationEvidence.js";
import type * as contributorProfiles from "../contributorProfiles.js";
import type * as effectIndexArchive from "../effectIndexArchive.js";
import type * as effectIndexArticles from "../effectIndexArticles.js";
import type * as indexLayouts from "../indexLayouts.js";
import type * as lib_adminIntentTokens from "../lib/adminIntentTokens.js";
import type * as lib_articleFieldWrites from "../lib/articleFieldWrites.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_contributorProfiles from "../lib/contributorProfiles.js";
import type * as lib_effectIndexArchiveReadProjections from "../lib/effectIndexArchiveReadProjections.js";
import type * as lib_generatedPublication from "../lib/generatedPublication.js";
import type * as lib_subjectiveEffectReadProjections from "../lib/subjectiveEffectReadProjections.js";
import type * as lib_substanceIngestion from "../lib/substanceIngestion.js";
import type * as lib_substanceReadProjections from "../lib/substanceReadProjections.js";
import type * as lib_validators from "../lib/validators.js";
import type * as memberships from "../memberships.js";
import type * as moleculeClassTemplates from "../moleculeClassTemplates.js";
import type * as moleculeOverrides from "../moleculeOverrides.js";
import type * as prompts from "../prompts.js";
import type * as quotes from "../quotes.js";
import type * as replications from "../replications.js";
import type * as siteConfig from "../siteConfig.js";
import type * as subjectiveEffects from "../subjectiveEffects.js";
import type * as substanceIndex from "../substanceIndex.js";
import type * as tripReportContract from "../tripReportContract.js";
import type * as tripReportSubmissions from "../tripReportSubmissions.js";
import type * as tripReports from "../tripReports.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  articleFeedback: typeof articleFeedback;
  articleSources: typeof articleSources;
  authorAttribution: typeof authorAttribution;
  categoryLayout: typeof categoryLayout;
  changelog: typeof changelog;
  citationEvidence: typeof citationEvidence;
  contributorProfiles: typeof contributorProfiles;
  effectIndexArchive: typeof effectIndexArchive;
  effectIndexArticles: typeof effectIndexArticles;
  indexLayouts: typeof indexLayouts;
  "lib/adminIntentTokens": typeof lib_adminIntentTokens;
  "lib/articleFieldWrites": typeof lib_articleFieldWrites;
  "lib/auth": typeof lib_auth;
  "lib/contributorProfiles": typeof lib_contributorProfiles;
  "lib/effectIndexArchiveReadProjections": typeof lib_effectIndexArchiveReadProjections;
  "lib/generatedPublication": typeof lib_generatedPublication;
  "lib/subjectiveEffectReadProjections": typeof lib_subjectiveEffectReadProjections;
  "lib/substanceIngestion": typeof lib_substanceIngestion;
  "lib/substanceReadProjections": typeof lib_substanceReadProjections;
  "lib/validators": typeof lib_validators;
  memberships: typeof memberships;
  moleculeClassTemplates: typeof moleculeClassTemplates;
  moleculeOverrides: typeof moleculeOverrides;
  prompts: typeof prompts;
  quotes: typeof quotes;
  replications: typeof replications;
  siteConfig: typeof siteConfig;
  subjectiveEffects: typeof subjectiveEffects;
  substanceIndex: typeof substanceIndex;
  tripReportContract: typeof tripReportContract;
  tripReportSubmissions: typeof tripReportSubmissions;
  tripReports: typeof tripReports;
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
