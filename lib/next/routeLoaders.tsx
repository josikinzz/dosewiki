import "server-only";

import { cache, type ReactNode } from "react";
import {
  getPublicContributorByKey,
  getPublicProfileHistory,
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
  getPublicReplicationsByEffect,
  getPublicReportBySlug,
  getPublicReports,
  getPublicReportsBySubstanceNames,
  getPublicSubstanceBySlug,
  getPublicSubstances,
  getEffectArticlesByContributor,
  getReplicationsByContributor,
  getReportsByContributor,
  getReviewedArticlesByContributor,
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
import { getWarningBannerPresets } from "./warningBanners";
import {
  effectMatchesCategorySlug,
  getEffectCategoryDefinition,
} from "../../src/data/effectCategoryDefinitions";
import { resolveEnabledBanners } from "../../src/data/substanceWarningBanners";
import { ProfileBioMarkdown } from "../../src/components/pages/ProfileBioMarkdown";
import type { UserProfileEditorNote } from "../../src/components/pages/UserProfilePage";
import {
  buildBlogPostExcerpt,
  toBlogPostViewModel,
  type BlogPostViewModel,
} from "../../src/features/blog/domain/blogPostModel";
import {
  toWritingBlogPost,
  writingBlogPostSummary,
  type WritingBlogPost,
} from "../../src/features/blog/domain/writingBlogModel";
import { type NormalizedUserProfile } from "../../src/data/userProfiles";
import { toReportCardModel, type ReportCardModel } from "../../src/types/tripReport";
import {
  getSubstanceSearchNames,
  reportMatchesSubstance,
} from "../../src/features/reports/domain/tripReportIndex";
import { SITE_FLAVOR_CONFIG } from "../../src/config/siteFlavor";
import {
  isPublishableReplication,
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
import type { ContributorReviewedArticle } from "../../src/types/reviewedArticles";
import type { ArticleBylineAuthor } from "../../src/features/articles/domain/articleByline";
import {
  resolveEffectCategories,
  type EffectCategoryLink,
} from "../../src/features/effects/pages/replicationSubject";
import {
  findContributorProfileByAuthorName,
  findContributorProfileByKeyOrAlias,
  normalizeProfileKey,
} from "../contributorProfileIdentity";
import { applyCuratedOrder } from "../curatedOrder";
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
  const [
    josieProfile,
    lyreaProfile,
    moleculeUpdatedAt,
    contributorDirectory,
    externalReagentData,
    relatedTripReports,
    warningBannerPresets,
  ] = await Promise.all([
    getPublicContributorByKey("JOSIE"),
    getPublicContributorByKey("LYREA"),
    getMoleculeUpdatedAt(slug),
    getPublicContributorDirectory(),
    getCachedReagentDataForArticle(substance, slug),
    // Cached alongside the streamed Trip Reports section's own call; resolved
    // here too so the table of contents knows whether the section will render.
    getPublicReportsBySubstanceNames(getSubstanceSearchNames(substance)),
    // Every preset, enabled or not; the slug filter happens below. Returns []
    // on any failure, so a Convex outage drops banners rather than the article.
    getWarningBannerPresets(),
  ]);

  const moleculeOverrideUrl = moleculeUpdatedAt
    ? moleculeOverrideImageUrl(slug, moleculeUpdatedAt)
    : null;

  // The one place a banner becomes visible on this article, and it is given a
  // slug rather than the substance's classification — there is deliberately no
  // route from `substance.classification` to a rendered warning. Class matchers
  // are a suggestion inside /dev/banners and nothing more.
  //
  // `src/app/[slug]/page.tsx` is `revalidate = 3600, dynamicParams = false`, so
  // flipping `enabledSlugs` only reaches readers after ISR unless the write
  // route revalidates explicitly. That is why `/api/dev/warning-banner`
  // revalidates slugs *removed* from `enabledSlugs` as well as added ones:
  // otherwise switching a banner off would leave the warning cached on the
  // article it was just taken off for up to an hour.
  const warningBanners = resolveEnabledBanners(warningBannerPresets, slug);

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
    hasRelatedTripReports: relatedTripReports.some((report) =>
      reportMatchesSubstance(report, substance),
    ),
    warningBanners,
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
  | OkRouteResult<{
      article: PublicEffectIndexArticle;
      bylineAuthors: ArticleBylineAuthor[];
    }>
  | NotFoundRouteResult;

/**
 * Bylines render from `authorProfileKeys`, never from `authors`: the legacy
 * import left `authors` as raw Mongo ObjectIds, and "by 60542430198361300fea3610"
 * is worse than no byline at all. A key that no contributor profile claims is
 * dropped for the same reason, so an unbackfilled article shows no byline
 * exactly as it does today.
 */
async function resolveArticleBylineAuthors(
  article: PublicEffectIndexArticle,
): Promise<ArticleBylineAuthor[]> {
  const keys = article.authorProfileKeys ?? [];

  if (keys.length === 0) {
    return [];
  }

  const profiles = await getPublicContributorProfiles();
  const seen = new Set<string>();
  const authors: ArticleBylineAuthor[] = [];

  for (const rawKey of keys) {
    const profile = findContributorProfileByKeyOrAlias(profiles, normalizeProfileKey(rawKey));

    if (!profile || seen.has(profile.key)) {
      continue;
    }

    seen.add(profile.key);
    authors.push({
      key: profile.key,
      name: profile.displayName,
      href: getPublicRoutePath({ family: "contributor", params: { profileKey: profile.key } }),
    });
  }

  return authors;
}

/**
 * `effectIndexArticles` holds both families. A row is an article unless it says
 * otherwise, which is what keeps every legacy import — none of which carries
 * `kind` — on the article routes exactly as before.
 */
function isArticleKind(article: Pick<PublicEffectIndexArticle, "kind">): boolean {
  return article.kind !== "blog";
}

function isBlogKind(article: Pick<PublicEffectIndexArticle, "kind">): boolean {
  return article.kind === "blog";
}

export const loadArticleRoute = cache(async (slug: string): Promise<ArticleRouteResult> => {
  const article = await getPublicEffectIndexArticleBySlug(slug);

  // A blog post is not reachable at `/articles/<slug>` even though it shares
  // the table: the two families never render on each other's routes.
  if (!article || !isArticleKind(article)) {
    return { kind: "not-found" };
  }

  const bylineAuthors = await resolveArticleBylineAuthors(article);

  return {
    kind: "ok",
    pageProps: { article, bylineAuthors },
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
    const articles = (await getPublishedEffectIndexArticles()).filter(isArticleKind);

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

export type WritingBlogIndexRouteResult = OkRouteResult<{
  posts: WritingBlogPost[];
  emptyState?: PublicRouteEmptyState;
}>;

/**
 * The dose.wiki blog: `kind: "blog"` rows of `effectIndexArticles`, written in
 * the /dev Blog tab.
 *
 * This is a different blog from `loadBlogIndexRoute`, which serves the frozen
 * Effect Index archive out of `effectIndexArchive`. The separation is by data as
 * well as by flavor — these loaders read only rows that say `kind: "blog"`, and
 * no such row exists in the archive table, so neither corpus can leak into the
 * other's pages even if both routes were somehow reachable on one build.
 */
export const loadWritingBlogIndexRoute = cache(
  async (): Promise<WritingBlogIndexRouteResult> => {
    const rows = (await getPublishedEffectIndexArticles()).filter(isBlogKind);
    const posts = await Promise.all(
      rows.map(async (row) => toWritingBlogPost(row, await resolveArticleBylineAuthors(row))),
    );

    return {
      kind: "ok",
      pageProps: {
        posts,
        emptyState: posts.length === 0 ? blogIndexEmptyState : undefined,
      },
      metadata: {
        title: "Blog",
        description: `News, notes and long-form writing from ${SITE_FLAVOR_CONFIG.name}.`,
      },
      canonicalRoute: { family: "blog" },
    };
  },
);

export type WritingBlogPostRouteResult =
  | OkRouteResult<{ post: WritingBlogPost }>
  | NotFoundRouteResult;

export const loadWritingBlogPostRoute = cache(
  async (slug: string): Promise<WritingBlogPostRouteResult> => {
    const row = await getPublicEffectIndexArticleBySlug(slug);

    if (!row || !isBlogKind(row)) {
      return { kind: "not-found" };
    }

    const post = toWritingBlogPost(row, await resolveArticleBylineAuthors(row));

    return {
      kind: "ok",
      pageProps: { post },
      metadata: {
        title: post.title,
        description:
          writingBlogPostSummary(post, 160) ||
          `${post.title} — a post from ${SITE_FLAVOR_CONFIG.name}.`,
      },
      canonicalRoute: { family: "blogPost", params: { slug: post.slug } },
    };
  },
);

export type EffectsIndexRouteResult = OkRouteResult<
  EffectsIndexViewModel["pageProps"] & {
    emptyState?: PublicRouteEmptyState;
  }
>;

export const loadEffectsIndexRoute = cache(async (): Promise<EffectsIndexRouteResult> => {
  const [overview, effects] = await Promise.all([
    getPublicDataOverview(),
    getPublicEffects(),
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
  // The artist's own curation is handed to the walk rather than applied here,
  // because the walk re-sorts the set it is given; passing it through
  // `artistOrder` is what keeps the pinned run identical on both surfaces.
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
    artistOrder: artistProfile?.replicationOrder,
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
  /** Substance articles this contributor expert-reviewed, alphabetically. */
  reviewedArticles: ContributorReviewedArticle[];
  /** Staff "Editor's note" under the bio; null renders nothing. */
  editorNote: UserProfileEditorNote | null;
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

    // The staff note is signed by the site rather than the profile owner, so
    // the chip under the bubble carries Josie's avatar and, when the note has
    // no explicit attribution, her public name and role.
    const staffNote = profile.staffNote?.markdown.trim() ? profile.staffNote : null;

    // All four joins run off the same profile and the same name set, so a
    // contributor's reports, works and article credits can never disagree about
    // which credits are theirs. The reviewed-articles read is key-only: the
    // reviewer-email matching stays inside Convex.
    const [reports, replications, effectArticles, reviewedArticles, history, staffNoteSigner] =
      await Promise.all([
        getReportsByContributor(profile),
        readContributorReplications(profile),
        getEffectArticlesByContributor(profile),
        getReviewedArticlesByContributor(profile.key),
        getPublicProfileHistory(profile),
        staffNote ? getPublicContributorByKey("JOSIE") : Promise.resolve(null),
      ]);

    return {
      kind: "ok",
      pageProps: {
        profile,
        history,
        bioContent: profile.hasCustomBio ? <ProfileBioMarkdown content={profile.bio} /> : null,
        reportHrefPrefix: REPORT_HREF_PREFIX,
        // The contributor's own curation outranks the editorial list: it is
        // this person's page and they pinned these reports, so `reportOrder`
        // leads and everything unlisted keeps the default report order.
        tripReports: applyCuratedOrder(
          reports.map(toReportCardModel),
          profile.reportOrder,
          (report) => report.slug,
        ),
        // Curated works lead the rail. The contributor's own `replicationOrder`
        // comes first; beneath it, Effect Index editorial curation (a checked-in
        // list — the replication corpus *is* the Effect Index archive on either
        // flavor, so there is nothing flavor-specific about which pieces it
        // names) still floats its picks ahead of the default newest-first sort.
        replications: applyCuratedOrder(
          orderContributorWorksFeaturedFirst(
            orderContributorReplications(replications),
            EFFECT_INDEX_FEATURED_REPLICATION_SLUGS,
          ),
          profile.replicationOrder,
          (replication) => replication.slug,
        ),
        effectArticles,
        reviewedArticles,
        editorNote: staffNote
          ? {
              content: <ProfileBioMarkdown content={staffNote.markdown} />,
              attribution:
                staffNote.attribution?.trim() ||
                (staffNoteSigner
                  ? [staffNoteSigner.displayName, staffNoteSigner.role?.trim()]
                      .filter(Boolean)
                      .join(" · ")
                  : "Josie Kins"),
              avatarUrl: staffNoteSigner?.avatarUrl ?? null,
              avatarHref: staffNoteSigner
                ? getPublicRoutePath({
                    family: "contributor",
                    params: { profileKey: staffNoteSigner.key },
                  })
                : null,
            }
          : null,
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
