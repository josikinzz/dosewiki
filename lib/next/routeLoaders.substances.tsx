import "server-only";

import { cache } from "react";
import {
  getPublicContributorByKey,
  getPublicContributorDirectory,
  getPublicDataOverview,
  getPublicCategoryLayout,
  getPublicEffectArticles,
  getPublicEffectBySlug,
  getPublicEffects,
  getPublicGalleryReplications,
  getPublicReportsBySubstanceNames,
  getPublicSubstanceBySlug,
  getPublicSubstanceSlugs,
  type PublicEffectArticle,
} from "@server/convex/publicData";
import {
  buildArtistCreditLinks,
  type ArtistCreditLinks,
} from "../../src/features/effects/vcode/artistCreditLinks";
import { getPublicEffectDetail } from "@server/convex/publicLibrary";
import { getMoleculeUpdatedAt, moleculeOverrideImageUrl } from "@server/convex/publicData.molecules";
import { getPublicArticleHistory } from "@server/convex/publicData.changelog";
import { getCachedReagentDataForArticle } from "@server/reagentData";
import { getLocalizedPublicSubstanceBySlug } from "@server/translation/localizedSubstance";
import {
  getLocalizedPublicEffectArticles,
  getLocalizedPublicEffectBySlug,
  getLocalizedPublicEffects,
} from "@server/translation/localizedRecords";
import type { LiveLocale } from "./localeHostPolicy";
import {
  getLocalizedWarningBannerPresets,
  getSafetyBannerIconSize,
  getWarningBannerPresets,
} from "./warningBanners";
import { getCopy } from "./copyBlocks";
import {
  CITATION_OVERHAUL_BANNER_KEY_PREFIX,
  resolveEnabledBanners,
} from "../../src/data/substanceWarningBanners";
import { substanceHasCitationNeeded } from "../../src/lib/citations/citationTokens";
import { getSubstanceSearchNames, reportMatchesSubstance } from "../../src/features/reports/domain/tripReportIndex";
import {
  DOSAGE_PANEL_DISCLAIMER_KEY,
  TOLERANCE_SECTION_DISCLAIMER_KEY,
} from "../../src/features/article/components/sections/articleDisclaimerCopy";
import {
  EXPERT_REVIEW_CREDIT_KEY,
  REVIEW_STATUS_BANNER_KEY,
} from "../../src/features/article/components/sections/articleReviewCopy";
import { SITE_FLAVOR_CONFIG } from "../../src/config/siteFlavor";
import {
  getPsychoactiveSummaryDefinition,
  type PsychoactiveSummaryDefinition,
  type PsychoactiveSummarySectionDefinition,
  type PsychoactiveSummarySelection,
} from "../../src/features/psychoactive-summaries/summaryDefinitions";
import { effectsIndexEmptyState, type PublicRouteEmptyState } from "./publicRouteOutcomes";
import {
  buildEffectArticleViewModel,
  buildEffectsIndexViewModel,
  buildSubstanceArticleViewModel,
  type EffectArticleViewModel,
  type EffectsIndexViewModel,
  type SubstanceArticleViewModel,
} from "./publicRouteViewModels";
import { getSubstanceRouteAlias } from "./publicRouteAliases";
import { getPublicRoutePath } from "./publicSite";
import {
  type NotFoundRouteResult,
  type OkRouteResult,
  type RedirectRouteResult,
  toRouteMetadata,
} from "./routeLoaderResults";

export type SubstanceRouteResult =
  | (OkRouteResult<SubstanceArticleViewModel["pageProps"]> & { publicRevision?: string })
  | RedirectRouteResult
  | NotFoundRouteResult;

export const loadSubstanceRoute = cache(async (slug: string, locale: LiveLocale | null = null): Promise<SubstanceRouteResult> => {
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

  const substance = locale
    ? await getLocalizedPublicSubstanceBySlug(slug, locale.code)
    : await getPublicSubstanceBySlug(slug);

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
    linkableSubstanceSlugs,
    categoryLayout,
    externalReagentData,
    relatedTripReports,
    warningBannerPresets,
    warningBannerIconSize,
    copy,
    recentChanges,
  ] = await Promise.all([
    getPublicContributorByKey("JOSIE"),
    getPublicContributorByKey("LYREA"),
    getMoleculeUpdatedAt(slug),
    getPublicContributorDirectory(),
    // Slug set only: which wiki links resolve. The preview corpus would cost
    // 19 sequential round trips on a cold cache for the same answer.
    getPublicSubstanceSlugs(),
    getPublicCategoryLayout(),
    getCachedReagentDataForArticle(substance, slug),
    // Cached alongside the streamed Trip Reports section's own call; resolved
    // here too so the table of contents knows whether the section will render.
    getPublicReportsBySubstanceNames(getSubstanceSearchNames(substance)),
    // Banner membership and display metadata stay canonical. Locale routes
    // overlay only the reader-facing banner corpus fields.
    locale
      ? getLocalizedWarningBannerPresets(locale.code)
      : getWarningBannerPresets(),
    // One site-wide number shared by every banner. Degrades to the shipped
    // default rather than to nothing: a display preference must never be able to
    // suppress a warning.
    getSafetyBannerIconSize(),
    // Site copy, for the dosage panel's standing disclaimer. Already falls back
    // to the checked-in default inside the resolver, so an un-seeded deployment
    // still renders the sentence.
    getCopy(),
    // Human edits for the Article Status ledger. Needs the directory to name
    // contributors; the directory read is request-cached, so chaining it here
    // costs nothing extra over the parallel call above.
    getPublicContributorDirectory().then((directory) => getPublicArticleHistory(slug, directory)),
  ]);

  const moleculeOverrideUrl = moleculeUpdatedAt
    ? moleculeOverrideImageUrl(slug, moleculeUpdatedAt)
    : null;

  // The one place a banner becomes visible on this article, and it is given a
  // slug rather than the substance's classification — there is deliberately no
  // route from `substance.classification` to a rendered warning. Class matchers
  // are a suggestion inside /dev/banners and nothing more.
  //
  // `src/app/[slug]/page.tsx` uses hourly ISR, so flipping `enabledSlugs` only
  // reaches readers after ISR unless the write route revalidates explicitly.
  // That is why `/api/dev/warning-banner`
  // revalidates slugs *removed* from `enabledSlugs` as well as added ones:
  // otherwise switching a banner off would leave the warning cached on the
  // article it was just taken off for up to an hour.
  // Once the citation audit has stripped a refuted marker on this article, the
  // stored "citation system overhaul" presets (keys `citation-system-overhaul-*`
  // in the warningBannerPresets table) no longer describe it: the audit has run
  // here, and the sitewide beta disclaimer takes the banner's slot instead
  // (rendered by ArticleLayout). Filtering before resolveEnabledBanners also
  // frees the MAX_BANNERS_PER_ARTICLE slot for real safety banners. The apply
  // script revalidates the article path when it ships a strip, so the swap
  // reaches readers without a redeploy.
  const showBetaDisclaimer = substanceHasCitationNeeded(substance);
  const warningBanners = resolveEnabledBanners(
    showBetaDisclaimer
      ? warningBannerPresets.filter(
          (preset) => !preset.key.startsWith(CITATION_OVERHAUL_BANNER_KEY_PREFIX),
        )
      : warningBannerPresets,
    slug,
  );

  const viewModel = buildSubstanceArticleViewModel({
    slug,
    substance,
    linkableSubstanceSlugs,
    linkableCategoryKeys: categoryLayout?.categories.map(({ key }) => key) ?? [],
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
    warningBannerIconSize,
    showBetaDisclaimer,
    dosageDisclaimer: copy.text(DOSAGE_PANEL_DISCLAIMER_KEY),
    toleranceDisclaimer: copy.text(TOLERANCE_SECTION_DISCLAIMER_KEY),
    reviewStatusCopy: copy.text(REVIEW_STATUS_BANNER_KEY),
    expertReviewCredit: copy.text(EXPERT_REVIEW_CREDIT_KEY),
    recentChanges,
  });

  return {
    kind: "ok",
    publicRevision: "publicRevision" in substance && typeof substance.publicRevision === "string"
      ? substance.publicRevision : undefined,
    pageProps: viewModel.pageProps,
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "substance", params: { slug } },
  };
});

export type EffectRouteResult =
  | OkRouteResult<
      EffectArticleViewModel["pageProps"] & {
        artistCreditLinks: ArtistCreditLinks;
      }
    >
  | NotFoundRouteResult;

export const loadEffectRoute = cache(async (effectSlug: string, locale: LiveLocale | null = null): Promise<EffectRouteResult> => {
  const [
    effect,
    detail,
    contributorDirectory,
    linkableSubstanceSlugs,
    publicEffects,
    galleryReplications,
  ] = await Promise.all([
    locale ? getLocalizedPublicEffectBySlug(effectSlug, locale.code) : getPublicEffectBySlug(effectSlug),
    getPublicEffectDetail(effectSlug),
    getPublicContributorDirectory(),
    getPublicSubstanceSlugs(),
    getPublicEffects(),
    getPublicGalleryReplications(),
  ]);

  if (!effect) {
    return { kind: "not-found" };
  }

  const viewModel = buildEffectArticleViewModel({
    effectSlug,
    effect,
    detail,
    contributorDirectory,
    linkableSubstanceSlugs,
    linkableEffectSlugs: publicEffects.map(({ slug }) => slug),
  });

  return {
    kind: "ok",
    pageProps: {
      ...viewModel.pageProps,
      artistCreditLinks: buildArtistCreditLinks(galleryReplications),
    },
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "effect", params: { effectSlug } },
  };
});

/**
 * Selection matches on the English record (tags and English names), then the
 * localized article of the same slug stands in for the mirror so a translated
 * name never has to match the definition.
 */
function selectPsychoactiveSummaryEffects(
  effects: PublicEffectArticle[],
  selection: PsychoactiveSummarySelection,
  localizedBySlug: ReadonlyMap<string, PublicEffectArticle> | null,
): PublicEffectArticle[] {
  const selected =
    selection.type === "names"
      ? selection.names.flatMap((name) => {
          const effect = effects.find(
            (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
          );

          return effect ? [effect] : [];
        })
      : effects.filter(
          (effect) =>
            selection.tags.every((tag) => effect.tags.includes(tag)) &&
            !(selection.excludeTags ?? []).some((tag) => effect.tags.includes(tag)),
        );

  return localizedBySlug
    ? selected.map((effect) => localizedBySlug.get(effect.slug) ?? effect)
    : selected;
}

export type PsychoactiveSummaryRouteResult =
  | OkRouteResult<{
      definition: PsychoactiveSummaryDefinition;
      sections: Array<
        PsychoactiveSummarySectionDefinition & {
          effects: PublicEffectArticle[];
        }
      >;
      artistCreditLinks: ArtistCreditLinks;
    }>
  | NotFoundRouteResult;

export const loadPsychoactiveSummaryRoute = cache(
  async (
    summaryPath: readonly string[],
    locale: LiveLocale | null = null,
  ): Promise<PsychoactiveSummaryRouteResult> => {
    const definition = getPsychoactiveSummaryDefinition(summaryPath);

    if (!definition) {
      return { kind: "not-found" };
    }

    const [effects, localizedEffects, galleryReplications] = await Promise.all([
      getPublicEffectArticles(),
      locale ? getLocalizedPublicEffectArticles(locale.code) : null,
      getPublicGalleryReplications(),
    ]);
    const localizedBySlug = localizedEffects
      ? new Map(localizedEffects.map((effect) => [effect.slug, effect]))
      : null;

    return {
      kind: "ok",
      pageProps: {
        definition,
        sections: definition.sections.map((section) => ({
          ...section,
          effects: selectPsychoactiveSummaryEffects(
            effects,
            section.selection,
            localizedBySlug,
          ),
        })),
        artistCreditLinks: buildArtistCreditLinks(galleryReplications),
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

export type EffectsIndexRouteResult = OkRouteResult<
  EffectsIndexViewModel["pageProps"] & {
    emptyState?: PublicRouteEmptyState;
  }
>;
export const loadEffectsIndexRoute = cache(async (locale: LiveLocale | null = null): Promise<EffectsIndexRouteResult> => {
  const [overview, effects] = await Promise.all([
    getPublicDataOverview(),
    locale ? getLocalizedPublicEffects(locale.code) : getPublicEffects(),
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
