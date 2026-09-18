"use client";

/**
 * Client entry for the subjective-effects credit pill.
 *
 * `PublicFeedbackPrimitives` carries no directive on purpose: server routes
 * render its skeleton surface from `loading.tsx`, so marking the whole kit
 * client would push the loading scaffold into every reader bundle. The credit
 * pill is the one export in that file that localizes its own copy, so the
 * server-rendered Subjective Effects wrapper reaches it through this boundary
 * instead of calling the hook during static generation.
 */
export { ArticleContributorAttribution } from "./PublicFeedbackPrimitives";
export type { ArticleContributorAttributionProps } from "./PublicFeedbackPrimitives";
