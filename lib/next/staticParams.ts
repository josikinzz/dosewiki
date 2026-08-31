import "server-only";

import { cache } from "react";
import {
  getPublicRouteParams,
  getPublicRoutePlan,
  type PublicRouteFamily,
} from "./publicRoutePlan";

// Demand-rendered families (substances, replications, replicationArtists,
// contributors) deliberately have no loader here: their pages return [] from
// generateStaticParams and rely on ISR, while the route plan still feeds the
// sitemap.
const getStaticParamsFor = (family: PublicRouteFamily) =>
  cache(async () => getPublicRouteParams(await getPublicRoutePlan(), family));

export const getStaticCategoryParams = getStaticParamsFor("categories");
export const getStaticEffectParams = getStaticParamsFor("effects");
export const getStaticEffectCategoryParams =
  getStaticParamsFor("effectCategories");
export const getStaticPsychoactiveSummaryParams = getStaticParamsFor(
  "psychoactiveSummaries",
);
export const getStaticArticleParams = getStaticParamsFor("articles");
export const getStaticReportParams = getStaticParamsFor("reports");
export const getStaticMechanismParams = getStaticParamsFor("mechanisms");
export const getStaticMechanismQualifierParams = getStaticParamsFor(
  "mechanismQualifiers",
);
