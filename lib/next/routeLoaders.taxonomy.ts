import "server-only";

import { cache } from "react";
import {
  getPublicEffectSummariesBySlugs,
  getPublicEffects,
  getPublicArtistCreditRows,
  type PublicEffectPreview,
} from "@server/data/publicData";
import { getPublicCategoryDetail, getPublicMechanismDetail } from "@server/data/publicLibrary";
import {
  getLocalizedPublicEffects,
} from "@server/translation/localizedRecords";
import {
  buildArtistCreditLinks,
  type ArtistCreditLinks,
} from "../../src/features/effects/vcode/artistCreditLinks";
import { effectMatchesCategorySlug, getEffectCategoryDefinition } from "../../src/data/effectCategoryDefinitions";
import {
  getCategoryRouteAlias,
  getEffectCategoryRouteAlias,
  getEffectCategoryRouteAliasParams,
} from "./publicRouteAliases";
import type { LiveLocale } from "./localeHostPolicy";
import { getPublicRoutePath, type PublicRouteIdentity } from "./publicSite";
import {
  getStaticEffectCategoryParams,
} from "./staticParams";
import { toRouteMetadata, type RouteMetadataSource } from "./routeLoaderResults";
import { localizeRecords } from "../translation/liveTranslation";
import { getDrugClassContent } from "../../src/data/drugClassContent";
import {
  resolveDrugClassSections,
  INITIAL_DRUG_CLASS_SECTION_LIMIT,
  type CategoryEffect,
} from "../../src/components/pages/categoryPageContents";

export type TaxonomyRouteFamily =
  | "category"
  | "effectCategory"
  | "mechanism"
  | "mechanismQualifier";

export type TaxonomyRouteParams<TFamily extends TaxonomyRouteFamily> = Extract<
  PublicRouteIdentity,
  { family: TFamily }
>["params"];

export interface TaxonomyRouteDescriptor<TFamily extends TaxonomyRouteFamily, TDetail> {
  routeFamily: TFamily;
  getDetail: (params: TaxonomyRouteParams<TFamily>) => Promise<TDetail>;
  getMetadata: (input: { params: TaxonomyRouteParams<TFamily>; detail: TDetail | null }) => RouteMetadataSource;
  /** Returns the canonical params when the requested params are a known alias. */
  getAlias?: (params: TaxonomyRouteParams<TFamily>) => TaxonomyRouteParams<TFamily> | null;
  isMissing?: (detail: TDetail) => boolean;
  getStaticParams?: () => Promise<TaxonomyRouteParams<TFamily>[]>;
}

type TaxonomyOkRouteResult<TDetail> = {
  kind: "ok";
  detail: NonNullable<TDetail>;
  metadata: RouteMetadataSource;
  canonicalRoute: PublicRouteIdentity;
};

export type TaxonomyRouteResult<TDetail> =
  | TaxonomyOkRouteResult<TDetail>
  | { kind: "not-found"; metadata: RouteMetadataSource; canonicalRoute: PublicRouteIdentity }
  | {
      kind: "redirect";
      target: string;
      metadata: RouteMetadataSource;
      canonicalRoute: PublicRouteIdentity;
    };

/**
 * Shared pipeline for taxonomy detail routes. Alias resolution happens here, so
 * adding redirects to a family later is a descriptor field rather than page
 * surgery. The requested params stay on `canonicalRoute` for all result kinds,
 * matching how these routes have always built canonical metadata: alias and
 * missing params keep their own (fallback) metadata while the page body
 * redirects or 404s.
 */
export async function loadTaxonomyRoute<TFamily extends TaxonomyRouteFamily, TDetail>(
  descriptor: TaxonomyRouteDescriptor<TFamily, TDetail>,
  params: TaxonomyRouteParams<TFamily>,
): Promise<TaxonomyRouteResult<TDetail>> {
  const requestedRoute = {
    family: descriptor.routeFamily,
    params,
  } as Extract<PublicRouteIdentity, { family: TFamily }>;
  const aliasTarget = descriptor.getAlias?.(params) ?? null;

  if (aliasTarget) {
    return {
      kind: "redirect",
      target: getPublicRoutePath({
        family: descriptor.routeFamily,
        params: aliasTarget,
      } as Extract<PublicRouteIdentity, { family: TFamily }>),
      metadata: toRouteMetadata(descriptor.getMetadata({ params, detail: null })),
      canonicalRoute: requestedRoute,
    };
  }

  const detail = await descriptor.getDetail(params);
  const metadata = toRouteMetadata(descriptor.getMetadata({ params, detail }));

  const missing = descriptor.isMissing ? descriptor.isMissing(detail) : detail == null;

  if (missing) {
    return { kind: "not-found", metadata, canonicalRoute: requestedRoute };
  }

  return {
    kind: "ok",
    detail: detail as NonNullable<TDetail>,
    metadata,
    canonicalRoute: requestedRoute,
  };
}

export async function loadTaxonomyStaticParams<TFamily extends TaxonomyRouteFamily, TDetail>(
  descriptor: TaxonomyRouteDescriptor<TFamily, TDetail>,
): Promise<TaxonomyRouteParams<TFamily>[]> {
  return descriptor.getStaticParams ? await descriptor.getStaticParams() : [];
}

type CategoryDetailData = Awaited<ReturnType<typeof getPublicCategoryDetail>>;

const categoryRouteDescriptor: TaxonomyRouteDescriptor<"category", CategoryDetailData> = {
  routeFamily: "category",
  getAlias: ({ categoryKey }) => {
    const alias = getCategoryRouteAlias(categoryKey);
    return alias ? { categoryKey: alias } : null;
  },
  getDetail: ({ categoryKey }) => getPublicCategoryDetail(categoryKey),
  getMetadata: ({ detail }) => ({
    title: detail ? detail.definition.name : "Category",
    description: detail
      ? `Browse ${detail.total} substances grouped under ${detail.definition.name}.`
      : "Browse substances by category.",
  }),
};

export const loadCategoryMetadataRoute = cache((categoryKey: string) =>
  loadTaxonomyRoute(categoryRouteDescriptor, { categoryKey }),
);

export type CategoryRouteResult =
  | (TaxonomyOkRouteResult<CategoryDetailData> & {
      effects: CategoryEffect[];
      artistCreditLinks: ArtistCreditLinks;
    })
  | Exclude<TaxonomyRouteResult<CategoryDetailData>, { kind: "ok" }>;

export const loadCategoryRoute = cache(async (
  categoryKey: string,
  locale: LiveLocale | null = null,
): Promise<CategoryRouteResult> => {
  const result = await loadCategoryMetadataRoute(categoryKey);

  if (result.kind !== "ok") {
    return result;
  }

  const content = getDrugClassContent(result.detail.definition.key);
  if (!content?.sections?.length) {
    return { ...result, effects: [], artistCreditLinks: new Map() };
  }
  const previews = await getPublicEffects();
  const sections = resolveDrugClassSections(content, previews);
  const selectedSlugs = new Set(sections.flatMap(({ effects }) => effects.map(({ slug }) => slug)));
  const summarySlugs = [...new Set(sections
    .slice(0, INITIAL_DRUG_CLASS_SECTION_LIMIT)
    .flatMap(({ effects }) => effects.map(({ slug }) => slug)))];
  const [summaries, artistCreditRows] = await Promise.all([
    getPublicEffectSummariesBySlugs(summarySlugs),
    summarySlugs.length > 0 ? getPublicArtistCreditRows() : Promise.resolve([]),
  ]);
  const summaryBySlug = new Map(summaries.map((effect) => [effect.slug, effect]));
  const canonicalEffects = previews
    .filter(({ slug }) => selectedSlugs.has(slug))
    .map((effect) => summaryBySlug.get(effect.slug) ?? effect);
  const effects = locale
    ? (await localizeRecords(canonicalEffects, locale.code, "effect")).records
    : canonicalEffects;

  return {
    ...result,
    effects,
    artistCreditLinks: buildArtistCreditLinks(artistCreditRows),
  };
});

type EffectCategoryDetailData = PublicEffectPreview[] | null;

async function getEffectCategoryDetail(
  categorySlug: string,
  locale: LiveLocale | null = null,
): Promise<EffectCategoryDetailData> {
  if (!getEffectCategoryDefinition(categorySlug)) {
    return null;
  }

  const canonicalEffects = (await getPublicEffects())
    .filter((effect) => effectMatchesCategorySlug(effect, categorySlug));
  const effects = locale
    ? (await localizeRecords(canonicalEffects, locale.code, "effect")).records
    : canonicalEffects;

  return effects.sort((a, b) => a.name.localeCompare(b.name));
}

export const effectCategoryRouteDescriptor: TaxonomyRouteDescriptor<
  "effectCategory",
  EffectCategoryDetailData
> = {
  routeFamily: "effectCategory",
  getStaticParams: async () => [
    ...((await getStaticEffectCategoryParams()) as { categorySlug: string }[]),
    ...getEffectCategoryRouteAliasParams(),
  ],
  getAlias: ({ categorySlug }) => {
    const alias = getEffectCategoryRouteAlias(categorySlug);
    return alias ? { categorySlug: alias } : null;
  },
  getDetail: ({ categorySlug }) => getEffectCategoryDetail(categorySlug),
  getMetadata: ({ params, detail }) => ({
    // Bare page name; buildPublicPageMetadata appends the flavored " - <suffix>" tail.
    title: getEffectCategoryDefinition(params.categorySlug)?.name ?? "Effect category",
    description: `Browse ${detail ? detail.length : 0} effects in the ${params.categorySlug} category.`,
  }),
};

export const loadEffectCategoryRoute = cache((
  categorySlug: string,
  locale: LiveLocale | null = null,
) => locale
  ? loadTaxonomyRoute(
      { ...effectCategoryRouteDescriptor, getDetail: ({ categorySlug: slug }) => getEffectCategoryDetail(slug, locale) },
      { categorySlug },
    )
  : loadTaxonomyRoute(effectCategoryRouteDescriptor, { categorySlug }),
);

type MechanismDetailData = Awaited<ReturnType<typeof getPublicMechanismDetail>>;

const mechanismRouteDescriptor: TaxonomyRouteDescriptor<"mechanism", MechanismDetailData> = {
  routeFamily: "mechanism",
  getDetail: ({ mechanismSlug }) => getPublicMechanismDetail(mechanismSlug),
  getMetadata: ({ detail }) => ({
    title: detail?.definition.name ?? "Mechanism",
    description: detail
      ? `Browse ${detail.definition.total} substances grouped under ${detail.definition.name}.`
      : "Browse mechanism routes.",
  }),
};

export const loadMechanismRoute = cache((mechanismSlug: string) =>
  loadTaxonomyRoute(mechanismRouteDescriptor, { mechanismSlug }),
);

type MechanismQualifierDetailData = {
  mechanism: NonNullable<MechanismDetailData>;
  qualifier: NonNullable<MechanismDetailData>["qualifiers"][number];
} | null;

async function getMechanismQualifierDetail({
  mechanismSlug,
  qualifierSlug,
}: TaxonomyRouteParams<"mechanismQualifier">): Promise<MechanismQualifierDetailData> {
  const mechanism = await getPublicMechanismDetail(mechanismSlug, qualifierSlug);
  const qualifier = mechanism?.qualifiers.find((entry) => entry.key === qualifierSlug);

  if (!mechanism || !qualifier) {
    return null;
  }

  return { mechanism, qualifier };
}

const mechanismQualifierRouteDescriptor: TaxonomyRouteDescriptor<
  "mechanismQualifier",
  MechanismQualifierDetailData
> = {
  routeFamily: "mechanismQualifier",
  getDetail: getMechanismQualifierDetail,
  getMetadata: ({ detail }) => ({
    title: detail
      ? `${detail.mechanism.definition.name} ${detail.qualifier.label}`
      : "Mechanism qualifier",
    description: detail
      ? `Browse ${detail.qualifier.total} substances in the ${detail.qualifier.label} qualifier.`
      : "Browse mechanism qualifier routes.",
  }),
};

export const loadMechanismQualifierRoute = cache((mechanismSlug: string, qualifierSlug: string) =>
  loadTaxonomyRoute(mechanismQualifierRouteDescriptor, { mechanismSlug, qualifierSlug }),
);
