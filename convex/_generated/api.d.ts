/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as articleSources from "../articleSources.js";
import type * as articles from "../articles.js";
import type * as changelog from "../changelog.js";
import type * as effectIndexArticles from "../effectIndexArticles.js";
import type * as prompts from "../prompts.js";
import type * as quotes from "../quotes.js";
import type * as replications from "../replications.js";
import type * as subjectiveEffects from "../subjectiveEffects.js";
import type * as tripReports from "../tripReports.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  articleSources: typeof articleSources;
  articles: typeof articles;
  changelog: typeof changelog;
  effectIndexArticles: typeof effectIndexArticles;
  prompts: typeof prompts;
  quotes: typeof quotes;
  replications: typeof replications;
  subjectiveEffects: typeof subjectiveEffects;
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
