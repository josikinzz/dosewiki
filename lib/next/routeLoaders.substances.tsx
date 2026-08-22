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
  getPublicReportsBySubstanceNames,
  getPublicSubstanceBySlug,
  getPublicSubstances,
  type PublicEffectArticle,
} from "@server/convex/publicData";
import { getPublicEffectDetail } from "@server/convex/publicLibrary";
import { getMoleculeUpdatedAt, moleculeOverrideImageUrl } from "@server/convex/publicData.molecules";
import { getCachedReagentDataForArticle } from "@server/reagentData";
import { getSafetyBannerIconSize, getWarningBannerPresets } from "./warningBanners";
import { getCopy } from "./copyBlocks";
import { resolveEnabledBanners } from "../../src/data/substanceWarningBanners";
import { getSubstanceSearchNames, reportMatchesSubstance } from "../../src/features/reports/domain/tripReportIndex";
import {
  DOSAGE_PANEL_DISCLAIMER_KEY,
  TOLERANCE_SECTION_DISCLAIMER_KEY,
} from "../../src/features/article/components/sections/articleDisclaimerCopy";
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
    publicSubstances,
    categoryLayout,
    externalReagentData,
    relatedTripReports,
    warningBannerPresets,
    warningBannerIconSize,
    copy,
  ] = await Promise.all([
    getPublicContributorByKey("JOSIE"),
    getPublicContributorByKey("LYREA"),
    getMoleculeUpdatedAt(slug),
    getPublicContributorDirectory(),
    getPublicSubstances(),
    getPublicCategoryLayout(),
    getCachedReagentDataForArticle(substance, slug),
    // Cached alongside the streamed Trip Reports section's own call; resolved
    // here too so the table of contents knows whether the section will render.
    getPublicReportsBySubstanceNames(getSubstanceSearchNames(substance)),
    // Every preset, enabled or not; the slug filter happens below. Returns []
    // on any failure, so a Convex outage drops banners rather than the article.
    getWarningBannerPresets(),
    // One site-wide number shared by every banner. Degrades to the shipped
    // default rather than to nothing: a display preference must never be able to
    // suppress a warning.
    getSafetyBannerIconSize(),
    // Site copy, for the dosage panel's standing disclaimer. Already falls back
    // to the checked-in default inside the resolver, so an un-seeded deployment
    // still renders the sentence.
    getCopy(),
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
    linkableSubstanceSlugs: publicSubstances.map(({ slug }) => slug),
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
    dosageDisclaimer: copy.text(DOSAGE_PANEL_DISCLAIMER_KEY),
    toleranceDisclaimer: copy.text(TOLERANCE_SECTION_DISCLAIMER_KEY),
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
  const [effect, detail, contributorDirectory, publicSubstances, publicEffects] = await Promise.all([
    getPublicEffectBySlug(effectSlug),
    getPublicEffectDetail(effectSlug),
    getPublicContributorDirectory(),
    getPublicSubstances(),
    getPublicEffects(),
  ]);

  if (!effect) {
    return { kind: "not-found" };
  }

  const viewModel = buildEffectArticleViewModel({
    effectSlug,
    effect,
    detail,
    contributorDirectory,
    linkableSubstanceSlugs: publicSubstances.map(({ slug }) => slug),
    linkableEffectSlugs: publicEffects.map(({ slug }) => slug),
  });

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
