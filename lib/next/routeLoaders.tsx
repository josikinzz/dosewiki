import "server-only";

import { cache, type ReactNode } from "react";
import {
  getEffectsByCategory,
  getPublicContributorByKey,
  getPublicDataOverview,
  getPublicEffectArticles,
  getPublicEffectBySlug,
  getPublicEffects,
  getPublicReplications,
  getPublicReportBySlug,
  getPublicReports,
  getPublicSubstanceBySlug,
  getPublicSubstances,
  getReportsByContributor,
  type PublicEffectArticle,
  type PublicEffectPreview,
  type TripReportDetailRecord,
} from "@server/convex/publicData";
import {
  getPublicCategoryDetail,
  getPublicEffectDetail,
  getPublicMechanismDetail,
} from "@server/convex/publicLibrary";
import { getEffectCategoryDefinition } from "../../src/data/effectCategoryDefinitions";
import { ProfileBioMarkdown } from "../../src/components/pages/ProfileBioMarkdown";
import { buildProfileHistory, type NormalizedUserProfile } from "../../src/data/userProfiles";
import { toReportCardModel, type ReportCardModel } from "../../src/types/tripReport";
import type { GalleryReplication } from "../../src/types/replications";
import type { ChangeLogEntry } from "../../src/data/changelog/changeLog";
import {
  effectsIndexEmptyState,
  reportsIndexEmptyState,
  type PublicRouteEmptyState,
} from "./publicRouteOutcomes";
import {
  buildEffectArticleViewModel,
  buildEffectsIndexViewModel,
  buildMetadataDescription,
  buildReportsIndexViewModel,
  buildSubstanceArticleViewModel,
  type EffectArticleViewModel,
  type EffectsIndexViewModel,
  type PublicPageMetadataSource,
  type ReportsIndexViewModel,
  type SubstanceArticleViewModel,
} from "./publicRouteViewModels";
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

const REPORT_HREF_PREFIX = "/reports/";

export interface RouteMetadataSource {
  title: string;
  description: string;
}

interface OkRouteResult<PageProps> {
  kind: "ok";
  pageProps: PageProps;
  metadata: RouteMetadataSource;
  canonicalRoute: PublicRouteIdentity;
}

type NotFoundRouteResult = { kind: "not-found" };

/**
 * Metadata descriptions must never ship citation tokens, regardless of which
 * upstream surface produced the text, so stripping is applied unconditionally.
 */
function toRouteMetadata(metadata: PublicPageMetadataSource): RouteMetadataSource {
  return {
    title: metadata.title,
    description: buildMetadataDescription(metadata.description),
  };
}

export type SubstanceRouteResult =
  | OkRouteResult<SubstanceArticleViewModel["pageProps"]>
  | NotFoundRouteResult;

export const loadSubstanceRoute = cache(async (slug: string): Promise<SubstanceRouteResult> => {
  const substance = await getPublicSubstanceBySlug(slug);

  if (!substance) {
    return { kind: "not-found" };
  }

  // Resolve the two fixed contributor-credit avatars from their profiles so the
  // closing Contributors section mirrors whatever each profile page shows.
  const [josieProfile, lyreaProfile] = await Promise.all([
    getPublicContributorByKey("JOSIE"),
    getPublicContributorByKey("LYREA"),
  ]);

  const viewModel = buildSubstanceArticleViewModel({
    slug,
    substance,
    contributorAvatars: {
      josie: josieProfile?.avatarUrl ?? null,
      lyrea: lyreaProfile?.avatarUrl ?? null,
    },
  });

  return {
    kind: "ok",
    pageProps: viewModel.pageProps,
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "substance", params: { slug } },
  };
});

export type EffectRouteResult =
  | OkRouteResult<EffectArticleViewModel["pageProps"]>
  | NotFoundRouteResult;

export const loadEffectRoute = cache(async (effectSlug: string): Promise<EffectRouteResult> => {
  const [effect, detail] = await Promise.all([
    getPublicEffectBySlug(effectSlug),
    getPublicEffectDetail(effectSlug),
  ]);

  if (!effect) {
    return { kind: "not-found" };
  }

  const viewModel = buildEffectArticleViewModel({ effectSlug, effect, detail });

  return {
    kind: "ok",
    pageProps: viewModel.pageProps,
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "effect", params: { effectSlug } },
  };
});

export type EffectsIndexRouteResult = OkRouteResult<
  EffectsIndexViewModel["pageProps"] & {
    emptyState?: PublicRouteEmptyState;
    replications: GalleryReplication[];
  }
>;

export const loadEffectsIndexRoute = cache(async (): Promise<EffectsIndexRouteResult> => {
  const [overview, effects, replications] = await Promise.all([
    getPublicDataOverview(),
    getPublicEffects(),
    getPublicReplications(),
  ]);
  const viewModel = buildEffectsIndexViewModel({
    effectCount: overview.effectCount,
    effects,
  });

  return {
    kind: "ok",
    pageProps: {
      ...viewModel.pageProps,
      emptyState: effects.length === 0 ? effectsIndexEmptyState : undefined,
      replications,
    },
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "effects" },
  };
});

export type ReportsIndexRouteResult = OkRouteResult<
  ReportsIndexViewModel["pageProps"] & { emptyState?: PublicRouteEmptyState }
>;

export const loadReportsIndexRoute = cache(async (): Promise<ReportsIndexRouteResult> => {
  const [overview, reports] = await Promise.all([getPublicDataOverview(), getPublicReports()]);
  const viewModel = buildReportsIndexViewModel({
    reportCount: overview.reportCount,
    reports,
  });

  return {
    kind: "ok",
    pageProps: {
      ...viewModel.pageProps,
      emptyState: reports.length === 0 ? reportsIndexEmptyState : undefined,
    },
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "reports" },
  };
});

export const REPORT_FALLBACK_METADATA: RouteMetadataSource = {
  title: "Trip report",
  description: "Browse experience reports from dose.wiki contributors.",
};

export type ReportRouteResult =
  | (OkRouteResult<{ report: TripReportDetailRecord }> & {
      substanceBySlug: Record<string, { name: string }>;
    })
  | NotFoundRouteResult;

export const loadReportRoute = cache(async (slug: string): Promise<ReportRouteResult> => {
  const [report, substances] = await Promise.all([getPublicReportBySlug(slug), getPublicSubstances()]);

  if (!report) {
    return { kind: "not-found" };
  }

  return {
    kind: "ok",
    pageProps: { report },
    substanceBySlug: Object.fromEntries(
      substances.map((substance) => [substance.slug, { name: substance.title }]),
    ),
    metadata: {
      title: report.title,
      description: buildMetadataDescription(report.introduction ?? REPORT_FALLBACK_METADATA.description),
    },
    canonicalRoute: { family: "report", params: { slug } },
  };
});

export interface ContributorRoutePageProps {
  profile: NormalizedUserProfile;
  history: ChangeLogEntry[];
  bioContent: ReactNode;
  reportHrefPrefix: string;
  tripReports: ReportCardModel[];
}

export type ContributorRouteResult =
  | OkRouteResult<ContributorRoutePageProps>
  | {
      kind: "redirect";
      target: string;
      metadata: RouteMetadataSource;
      canonicalRoute: PublicRouteIdentity;
    }
  | { kind: "not-found"; normalizedKey: string };

export const loadContributorRoute = cache(
  async (profileKey: string): Promise<ContributorRouteResult> => {
    const normalizedKey = decodeURIComponent(profileKey).trim().toUpperCase();
    const profile = await getPublicContributorByKey(normalizedKey);

    if (!profile) {
      return { kind: "not-found", normalizedKey };
    }

    const canonicalRoute: PublicRouteIdentity = {
      family: "contributor",
      params: { profileKey: profile.key },
    };
    const metadata: RouteMetadataSource = {
      title: profile.displayName || "Contributor",
      description: buildMetadataDescription(
        profile.bio || `Browse contributor profile ${normalizedKey}.`,
      ),
    };

    if (profile.key !== normalizedKey) {
      return {
        kind: "redirect",
        target: getPublicRoutePath(canonicalRoute),
        metadata,
        canonicalRoute,
      };
    }

    const reports = await getReportsByContributor(profile);

    return {
      kind: "ok",
      pageProps: {
        profile,
        history: buildProfileHistory(profile.key, 5, profile.aliases),
        bioContent: profile.hasCustomBio ? <ProfileBioMarkdown content={profile.bio} /> : null,
        reportHrefPrefix: REPORT_HREF_PREFIX,
        tripReports: reports.map(toReportCardModel),
      },
      metadata,
      canonicalRoute,
    };
  },
);

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

  return await getEffectsByCategory(categorySlug);
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
