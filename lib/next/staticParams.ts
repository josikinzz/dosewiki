import "server-only";

import { cache } from "react";
import {
  getPublicRouteParams,
  getPublicRoutePlan,
  type PublicRouteFamily,
} from "./publicRoutePlan";

const getStaticParamsFor = (family: PublicRouteFamily) =>
  cache(async () => getPublicRouteParams(await getPublicRoutePlan(), family));

export const getStaticSubstanceParams = getStaticParamsFor("substances");
export const getStaticCategoryParams = getStaticParamsFor("categories");
export const getStaticEffectParams = getStaticParamsFor("effects");
export const getStaticEffectCategoryParams = getStaticParamsFor("effectCategories");
export const getStaticReportParams = getStaticParamsFor("reports");
export const getStaticContributorParams = getStaticParamsFor("contributors");
export const getStaticPsychoactiveClassParams = getStaticParamsFor("psychoactiveClasses");
export const getStaticChemicalClassParams = getStaticParamsFor("chemicalClasses");
export const getStaticMechanismParams = getStaticParamsFor("mechanisms");
export const getStaticMechanismQualifierParams = getStaticParamsFor("mechanismQualifiers");
