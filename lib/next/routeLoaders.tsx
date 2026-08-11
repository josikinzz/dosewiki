import "server-only";

import { cache, type ReactNode } from "react";
import {
  getPublicContributorByKey,
  getPublicContributorDirectory,
  getPublicContributorProfiles,
  getPublicDataOverview,
  getPublishedEffectIndexArticles,
  getPublicEffectArticles,
  getPublicEffectIndexArticleBySlug,
  getPublicEffectIndexPostBySlug,
  getPublicEffectIndexPosts,
  getPublicEffectBySlug,
  getPublicEffects,
  getPublicReplicationBySlug,
  getPublicReplications,
  getPublicReplicationsByEffect,
  getPublicReportBySlug,
  getPublicReports,
  getPublicSubstanceBySlug,
  getPublicSubstances,
  getEffectArticlesByContributor,
  getReplicationsByContributor,
  getReportsByContributor,
  type PublicEffectArticle,
  type PublicEffectIndexArticle,
  type PublicEffectPreview,
  type TripReportDetailRecord,
} from "@server/convex/publicData";
import {
  getPublicCategoryDetail,
  getPublicEffectDetail,
  getPublicMechanismDetail,
} from "@server/convex/publicLibrary";
import { getMoleculeUpdatedAt, moleculeOverrideImageUrl } from "@server/convex/publicData.molecules";
import { getCachedReagentDataForArticle } from "@server/reagentData";
import {
  effectMatchesCategorySlug,
  getEffectCategoryDefinition,
} from "../../src/data/effectCategoryDefinitions";
import { ProfileBioMarkdown } from "../../src/components/pages/ProfileBioMarkdown";
import {
  buildBlogPostExcerpt,
  toBlogPostViewModel,
  type BlogPostViewModel,
} from "../../src/features/blog/domain/blogPostModel";
import { buildProfileHistory, type NormalizedUserProfile } from "../../src/data/userProfiles";
import { toReportCardModel, type ReportCardModel } from "../../src/types/tripReport";
import { SITE_FLAVOR_CONFIG } from "../../src/config/siteFlavor";
import {
  isPublishableReplication,
  type GalleryReplication,
  type ReplicationWithUrl,
} from "../../src/types/replications";
import { hasKnownCreator } from "../../src/features/effects/components/replicationCredit";
import {
  orderContributorReplications,
  orderContributorWorksFeaturedFirst,
  selectReplicationNeighborSet,
  type ReplicationNeighborSet,
} from "../../src/features/effects/gallery/replicationDetailModel";
import { EFFECT_INDEX_FEATURED_REPLICATION_SLUGS } from "./effectIndexHome";
import type { ContributorEffectCredit } from "../../src/types/effectCredits";
import {
  resolveEffectCategories,
  type EffectCategoryLink,
} from "../../src/features/effects/pages/replicationSubject";
import { findContributorProfileByAuthorName } from "../contributorProfileIdentity";
import type { ContributorDirectory } from "../contributorDirectory";
import type { ChangeLogEntry } from "../../src/data/changelog/changeLog";
import {
  getPsychoactiveSummaryDefinition,
  type PsychoactiveSummaryDefinition,
  type PsychoactiveSummarySectionDefinition,
  type PsychoactiveSummarySelection,
} from "../../src/features/psychoactive-summaries/summaryDefinitions";
import {
  articlesIndexEmptyState,
  blogIndexEmptyState,
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
  getReplicationRouteAlias,
  getSubstanceRouteAlias,
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
  noIndex?: boolean;
}

interface OkRouteResult<PageProps> {
  kind: "ok";
  pageProps: PageProps;
  metadata: RouteMetadataSource;
  canonicalRoute: PublicRouteIdentity;
}

type NotFoundRouteResult = { kind: "not-found" };
type RedirectRouteResult = {
  kind: "redirect";
  target: string;
  metadata: RouteMetadataSource;
  canonicalRoute: PublicRouteIdentity;
};

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
  | RedirectRouteResult
  | NotFoundRouteResult;

export const loadSubstanceRoute = cache(async (slug: string): Promise<SubstanceRouteResult> => {
  const aliasTarget = getSubstanceRouteAlias(slug);

  if (aliasTarget) {
    return {
      kind: "redirect",
      target: getPublicRoutePath({ family: "substance", params: { slug: aliasTarget } }),
      metadata: {
        title: "Substance",
        description: `Redirecting to the canonical ${SITE_FLAVOR_CONFIG.name} substance page.`,
      },
      canonicalRoute: { family: "substance", params: { slug } },
    };
  }

  const substance = await getPublicSubstanceBySlug(slug);

  if (!substance) {
    return { kind: "not-found" };
  }

  // Resolve the two fixed contributor-credit avatars from their profiles so the
  // closing Contributors section mirrors whatever each profile page shows. Also
  // look up any hand-authored molecule override for this slug so its diagram can
  // be swapped for the live Convex render.
  const [josieProfile, lyreaProfile, moleculeUpdatedAt, contributorDirectory, externalReagentData] =
    await Promise.all([
      getPublicContributorByKey("JOSIE"),
      getPublicContributorByKey("LYREA"),
      getMoleculeUpdatedAt(slug),
      getPublicContributorDirectory(),
      getCachedReagentDataForArticle(substance, slug),
    ]);

  const moleculeOverrideUrl = moleculeUpdatedAt
    ? moleculeOverrideImageUrl(slug, moleculeUpdatedAt)
    : null;

  const viewModel = buildSubstanceArticleViewModel({
    slug,
    substance,
    contributorAvatars: {
      josie: josieProfile?.avatarUrl ?? null,
      lyrea: lyreaProfile?.avatarUrl ?? null,
    },
    contributorDirectory,
    moleculeOverrideUrl,
    externalReagentData,
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
  const [effect, detail, contributorDirectory] = await Promise.all([
    getPublicEffectBySlug(effectSlug),
    getPublicEffectDetail(effectSlug),
    getPublicContributorDirectory(),
  ]);

  if (!effect) {
    return { kind: "not-found" };
  }

  const viewModel = buildEffectArticleViewModel({ effectSlug, effect, detail, contributorDirectory });

  return {
    kind: "ok",
    pageProps: viewModel.pageProps,
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "effect", params: { effectSlug } },
  };
});

function selectPsychoactiveSummaryEffects(
  effects: PublicEffectArticle[],
  selection: PsychoactiveSummarySelection,
): PublicEffectArticle[] {
  if (selection.type === "names") {
    return selection.names.flatMap((name) => {
      const effect = effects.find(
        (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
      );

      return effect ? [effect] : [];
    });
  }

  return effects.filter(
    (effect) =>
      selection.tags.every((tag) => effect.tags.includes(tag)) &&
      !(selection.excludeTags ?? []).some((tag) => effect.tags.includes(tag)),
  );
}

export type PsychoactiveSummaryRouteResult =
  | OkRouteResult<{
      definition: PsychoactiveSummaryDefinition;
      sections: Array<
        PsychoactiveSummarySectionDefinition & {
          effects: PublicEffectArticle[];
        }
      >;
    }>
  | NotFoundRouteResult;

export const loadPsychoactiveSummaryRoute = cache(
  async (
    summaryPath: readonly string[],
  ): Promise<PsychoactiveSummaryRouteResult> => {
    const definition = getPsychoactiveSummaryDefinition(summaryPath);

    if (!definition) {
      return { kind: "not-found" };
    }

    const effects = await getPublicEffectArticles();

    return {
      kind: "ok",
      pageProps: {
        definition,
        sections: definition.sections.map((section) => ({
          ...section,
          effects: selectPsychoactiveSummaryEffects(
            effects,
            section.selection,
          ),
        })),
      },
      metadata: {
        title: definition.metadataTitle,
        description: definition.metadataDescription,
      },
      canonicalRoute: {
        family: "psychoactiveSummary",
        params: { summaryPath: [...definition.summaryPath] },
      },
    };
  },
);

export type ArticleRouteResult =
  | OkRouteResult<{ article: PublicEffectIndexArticle }>
  | NotFoundRouteResult;

export const loadArticleRoute = cache(async (slug: string): Promise<ArticleRouteResult> => {
  const article = await getPublicEffectIndexArticleBySlug(slug);

  if (!article) {
    return { kind: "not-found" };
  }

  return {
    kind: "ok",
    pageProps: { article },
    metadata: {
      title: article.title,
      description:
        article.shortDescription?.trim() || `${article.title} Effect Index article.`,
      noIndex: article.publication_status !== "published",
    },
    canonicalRoute: { family: "article", params: { slug } },
  };
});

export type ArticlesIndexRouteResult = OkRouteResult<{
  articles: PublicEffectIndexArticle[];
  emptyState?: PublicRouteEmptyState;
}>;

export const loadArticlesIndexRoute = cache(
  async (): Promise<ArticlesIndexRouteResult> => {
    const articles = await getPublishedEffectIndexArticles();

    return {
      kind: "ok",
      pageProps: {
        articles,
        emptyState:
          articles.length === 0 ? articlesIndexEmptyState : undefined,
      },
      metadata: {
        title: `Articles · ${articles.length} entries`,
        description: `Browse ${articles.length} published Effect Index articles in ${SITE_FLAVOR_CONFIG.name}.`,
      },
      canonicalRoute: { family: "articles" },
    };
  },
);

export type BlogIndexRouteResult = OkRouteResult<{
  posts: BlogPostViewModel[];
  emptyState?: PublicRouteEmptyState;
}>;

/**
 * The archived Effect Index blog. Only routed on the Effect Index flavor — the pages
 * themselves call `requireEffectIndexFlavor()` before reaching these loaders.
 */
export const loadBlogIndexRoute = cache(async (): Promise<BlogIndexRouteResult> => {
  const posts = (await getPublicEffectIndexPosts()).map(toBlogPostViewModel);

  return {
    kind: "ok",
    pageProps: {
      posts,
      emptyState: posts.length === 0 ? blogIndexEmptyState : undefined,
    },
    metadata: {
      title: "Blog",
      description: `Announcements and site updates from the ${SITE_FLAVOR_CONFIG.name} archive.`,
    },
    canonicalRoute: { family: "blog" },
  };
});

export type BlogPostRouteResult =
  | OkRouteResult<{ post: BlogPostViewModel }>
  | NotFoundRouteResult;

export const loadBlogPostRoute = cache(async (slug: string): Promise<BlogPostRouteResult> => {
  const post = await getPublicEffectIndexPostBySlug(slug);

  if (!post) {
    return { kind: "not-found" };
  }

  const viewModel = toBlogPostViewModel(post);

  return {
    kind: "ok",
    pageProps: { post: viewModel },
    metadata: {
      title: viewModel.title,
      description:
        buildBlogPostExcerpt(viewModel.body, 160) ||
        `${viewModel.title} — a post from the ${SITE_FLAVOR_CONFIG.name} archive.`,
    },
    canonicalRoute: { family: "blogPost", params: { slug: viewModel.slug } },
  };
});

export type EffectsIndexRouteResult = OkRouteResult<
  EffectsIndexViewModel["pageProps"] & {
    emptyState?: PublicRouteEmptyState;
    replications: GalleryReplication[];
    contributorDirectory: ContributorDirectory;
  }
>;

export const loadEffectsIndexRoute = cache(async (): Promise<EffectsIndexRouteResult> => {
  // The gallery's artist headings resolve to profile pages, and that resolution
  // needs the directory. Reading it here keeps the client gallery — which is
  // lazy-loaded and only mounts on the gallery tab — from fetching anything.
  const [overview, effects, replications, contributorDirectory] = await Promise.all([
    getPublicDataOverview(),
    getPublicEffects(),
    getPublicReplications(),
    getPublicContributorDirectory(),
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
      contributorDirectory,
    },
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "effects" },
  };
});

export interface ReplicationPageProps {
  replication: ReplicationWithUrl;
  /** Display name of the owning effect, absent when the row has no real effect. */
  effectName: string | null;
  effectSlug: string | null;
  /** Profile page of the credited artist, absent when no profile claims them. */
  artistProfileHref: string | null;
  effectCategories: EffectCategoryLink[];
  neighbors: ReplicationNeighborSet;
}

export type ReplicationRouteResult =
  | OkRouteResult<ReplicationPageProps>
  | RedirectRouteResult
  | NotFoundRouteResult;

/** Rows carry `effect_slug: "unknown"` when nothing real is attached. */
const hasRealEffect = (effectSlug?: string | null) =>
  Boolean(effectSlug && effectSlug !== "unknown");

/**
 * A contributor's works, tolerant of a deployment that predates the join.
 *
 * `replications:getByArtistNames` is additive, and a Convex deployment without
 * it answers with the same opaque `Server Error` it uses for every other
 * failure — the read adapter's explicit missing-function check only sees through
 * that in development. Both callers have a correct answer for "no works": the
 * profile renders no works section, and the permalink keeps the effect walk. An
 * unavailable portfolio must not take down a prerendered route, so this degrades
 * rather than throws — loudly, because an empty portfolio and a missing function
 * look identical on the rendered page.
 */
async function readContributorReplications(
  profile: NormalizedUserProfile,
): Promise<ReplicationWithUrl[]> {
  try {
    return await getReplicationsByContributor(profile);
  } catch (error) {
    console.warn(
      `[routeLoaders] replication credits unavailable for ${profile.key}; rendering without them.`,
      error,
    );
    return [];
  }
}

export const loadReplicationRoute = cache(async (slug: string): Promise<ReplicationRouteResult> => {
  // Slug normalisation rewrote a chunk of filename-derived URLs. Anything already
  // shared under the old slug has to keep resolving, so redirect before reading.
  const aliasTarget = getReplicationRouteAlias(slug);
  if (aliasTarget) {
    const canonicalRoute = { family: "replication" as const, params: { slug: aliasTarget } };
    return {
      kind: "redirect",
      target: getPublicRoutePath(canonicalRoute),
      metadata: toRouteMetadata({ title: "Replication", description: "Replication permalink." }),
      canonicalRoute,
    };
  }

  const replication = await getPublicReplicationBySlug(slug);

  // Three ways a stored row has no page here, all answered where the route plan
  // already omits it so a direct hit 404s rather than rendering:
  //
  //  - no resolvable asset: the permalink would be a broken image.
  //  - a figure: this page asserts what the row *is*, in prose ("a replication
  //    of the subjective effect X"), in its `<title>`, and in JSON-LD naming it
  //    an ImageObject that replicates that effect. Those are claims published to
  //    crawlers and aggregators, and none of them is true of a diagram.
  //  - a media kind nothing here can draw: the page would hand an audio file to
  //    `<AppImage>` under a pill reading "Image".
  //
  // `isPublishableReplication` is the same predicate the list reads use, so the
  // permalink and the gallery can never disagree about what is published.
  if (!replication || !replication.url || !isPublishableReplication(replication)) {
    return { kind: "not-found" };
  }

  const effectSlug = hasRealEffect(replication.effect_slug) ? replication.effect_slug : null;
  const creator = hasKnownCreator(replication.artist) ? replication.artist.trim() : null;

  const [effect, siblings, contributorProfiles] = await Promise.all([
    effectSlug ? getPublicEffectBySlug(effectSlug) : Promise.resolve(null),
    effectSlug ? getPublicReplicationsByEffect(effectSlug) : Promise.resolve([]),
    // Only a credit that names a person can resolve to a profile; the
    // unattributed markers never match one, so an unattributed row skips the
    // read rather than paying for a lookup that cannot succeed.
    creator ? getPublicContributorProfiles() : Promise.resolve([]),
  ]);

  const artistProfile = creator
    ? findContributorProfileByAuthorName(contributorProfiles, creator)
    : null;
  // A profile is what turns a credit line into a body of work — it carries the
  // aliases the join matches on. A named credit nobody has claimed therefore has
  // no "other works" set to offer, and keeps the effect walk below.
  // Ordered the same way the profile rail orders them. Someone arrives here by
  // clicking a tile in that rail, so if "next" did not land on the tile that sat
  // beside the one they clicked, the two surfaces would disagree about what
  // comes after what — which is the kind of thing that reads as a bug rather
  // than as a different ordering policy.
  const artistWorks = artistProfile
    ? orderContributorWorksFeaturedFirst(
        await readContributorReplications(artistProfile),
        EFFECT_INDEX_FEATURED_REPLICATION_SLUGS,
      )
    : [];

  const subject = effect?.name ?? null;
  const neighbors = selectReplicationNeighborSet({
    slug,
    artistWorks,
    artistName: artistProfile?.displayName ?? null,
    effectWorks: siblings,
    effectName: subject,
    galleryOrder: effect?.gallery_order,
  });

  return {
    kind: "ok",
    pageProps: {
      replication,
      effectName: subject,
      effectSlug,
      artistProfileHref: artistProfile
        ? getPublicRoutePath({ family: "contributor", params: { profileKey: artistProfile.key } })
        : null,
      effectCategories: effect ? resolveEffectCategories(effect.tags) : [],
      neighbors,
    },
    metadata: toRouteMetadata({
      title: creator ? `${replication.title} by ${creator}` : replication.title,
      description: subject
        ? `${replication.title}${creator ? ` by ${creator}` : ""} — a replication of the subjective effect ${subject}.`
        : `${replication.title}${creator ? ` by ${creator}` : ""} — a subjective effect replication.`,
    }),
    canonicalRoute: { family: "replication", params: { slug } },
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
  description: `Browse experience reports from ${SITE_FLAVOR_CONFIG.name} contributors.`,
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
  /** Replications credited to this contributor: curated works first, then newest. */
  replications: ReplicationWithUrl[];
  /** Effect articles crediting this contributor, alphabetically. */
  effectArticles: ContributorEffectCredit[];
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

    // All three joins run off the same profile and the same name set, so a
    // contributor's reports, works and article credits can never disagree about
    // which credits are theirs.
    const [reports, replications, effectArticles] = await Promise.all([
      getReportsByContributor(profile),
      readContributorReplications(profile),
      getEffectArticlesByContributor(profile),
    ]);

    return {
      kind: "ok",
      pageProps: {
        profile,
        history: buildProfileHistory(profile.key, 5, profile.aliases),
        bioContent: profile.hasCustomBio ? <ProfileBioMarkdown content={profile.bio} /> : null,
        reportHrefPrefix: REPORT_HREF_PREFIX,
        tripReports: reports.map(toReportCardModel),
        // Curated works lead the rail. The curation is Effect Index editorial
        // and lives in one checked-in list, but the replication corpus *is* the
        // Effect Index archive on either flavor, so there is nothing
        // flavor-specific about which pieces it names.
        replications: orderContributorWorksFeaturedFirst(
          orderContributorReplications(replications),
          EFFECT_INDEX_FEATURED_REPLICATION_SLUGS,
        ),
        effectArticles,
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
