import "server-only";

import { cache } from "react";
import {
  getPublicEffectArticles,
  getPublicEffects,
  type PublicEffectArticle,
  type PublicEffectPreview,
} from "@server/convex/publicData";
import { getPublicCategoryDetail, getPublicMechanismDetail } from "@server/convex/publicLibrary";
import { effectMatchesCategorySlug, getEffectCategoryDefinition } from "../../src/data/effectCategoryDefinitions";
import {
  getCategoryRouteAlias,
  getCategoryRouteAliasParams,
  getEffectCategoryRouteAlias,
  getEffectCategoryRouteAliasParams,
} from "./publicRouteAliases";
import { getPublicRoutePath, type PublicRouteIdentity } from "./publicSite";
import {
  getStaticCategoryParams,
  getStaticEffectCategoryParams,
  getStaticMechanismParams,
  getStaticMechanismQualifierParams,
} from "./staticParams";
import { toRouteMetadata, type RouteMetadataSource } from "./routeLoaderResults";

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
  getMetadata: (input: { params: TaxonomyRouteParams<TFamily>; detail: TDetail }) => RouteMetadataSource;
  /** Returns the canonical params when the requested params are a known alias. */
  getAlias?: (params: TaxonomyRouteParams<TFamily>) => TaxonomyRouteParams<TFamily> | null;
  isMissing?: (detail: TDetail) => boolean;
  getStaticParams?: () => Promise<TaxonomyRouteParams<TFamily>[]>;
}

export type TaxonomyOkRouteResult<TDetail> = {
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
  const detail = await descriptor.getDetail(params);
  const metadata = toRouteMetadata(descriptor.getMetadata({ params, detail }));

  if (aliasTarget) {
    return {
      kind: "redirect",
      target: getPublicRoutePath({
        family: descriptor.routeFamily,
        params: aliasTarget,
      } as Extract<PublicRouteIdentity, { family: TFamily }>),
      metadata,
      canonicalRoute: requestedRoute,
    };
  }

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

export const categoryRouteDescriptor: TaxonomyRouteDescriptor<"category", CategoryDetailData> = {
  routeFamily: "category",
  getStaticParams: async () => [
    ...((await getStaticCategoryParams()) as { categoryKey: string }[]),
    ...getCategoryRouteAliasParams(),
  ],
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

export type CategoryRouteResult =
  | (TaxonomyOkRouteResult<CategoryDetailData> & { effects: PublicEffectArticle[] })
  | Exclude<TaxonomyRouteResult<CategoryDetailData>, { kind: "ok" }>;

export const loadCategoryRoute = cache(async (categoryKey: string): Promise<CategoryRouteResult> => {
  const result = await loadTaxonomyRoute(categoryRouteDescriptor, { categoryKey });

  if (result.kind !== "ok") {
    return result;
  }

  return { ...result, effects: await getPublicEffectArticles() };
});

type EffectCategoryDetailData = PublicEffectPreview[] | null;

async function getEffectCategoryDetail(categorySlug: string): Promise<EffectCategoryDetailData> {
  if (!getEffectCategoryDefinition(categorySlug)) {
    return null;
  }

  const effects = await getPublicEffects();

  return effects
    .filter((effect) => effectMatchesCategorySlug(effect, categorySlug))
    .sort((a, b) => a.name.localeCompare(b.name));
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
    title: `Effect category · ${params.categorySlug}`,
    description: `Browse ${detail ? detail.length : 0} effects in the ${params.categorySlug} category.`,
  }),
};

export const loadEffectCategoryRoute = cache((categorySlug: string) =>
  loadTaxonomyRoute(effectCategoryRouteDescriptor, { categorySlug }),
);

type MechanismDetailData = Awaited<ReturnType<typeof getPublicMechanismDetail>>;

export const mechanismRouteDescriptor: TaxonomyRouteDescriptor<"mechanism", MechanismDetailData> = {
  routeFamily: "mechanism",
  getStaticParams: async () => (await getStaticMechanismParams()) as { mechanismSlug: string }[],
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
  const mechanism = await getPublicMechanismDetail(mechanismSlug);
  const qualifier = mechanism?.qualifiers.find((entry) => entry.key === qualifierSlug);

  if (!mechanism || !qualifier) {
    return null;
  }

  return { mechanism, qualifier };
}

export const mechanismQualifierRouteDescriptor: TaxonomyRouteDescriptor<
  "mechanismQualifier",
  MechanismQualifierDetailData
> = {
  routeFamily: "mechanismQualifier",
  getStaticParams: async () =>
    (await getStaticMechanismQualifierParams()) as {
      mechanismSlug: string;
      qualifierSlug: string;
    }[],
  getDetail: getMechanismQualifierDetail,
  getMetadata: ({ detail }) => ({
    title: detail
      ? `${detail.mechanism.definition.name} · ${detail.qualifier.label}`
      : "Mechanism qualifier",
    description: detail
      ? `Browse ${detail.qualifier.total} substances in the ${detail.qualifier.label} qualifier.`
      : "Browse mechanism qualifier routes.",
  }),
};

export const loadMechanismQualifierRoute = cache((mechanismSlug: string, qualifierSlug: string) =>
  loadTaxonomyRoute(mechanismQualifierRouteDescriptor, { mechanismSlug, qualifierSlug }),
);
