import "server-only";

import { cache } from "react";
import type { SubstanceArticle } from "../../src/schema";
import {
  getPublicCategoryLayout,
  getPublicEffectSlugs,
  getPublicEffectSummariesBySlugs,
  getPublicArtistCreditRows,
  getPublicEffectBySlug,
  getPublicEffectIndex,
  getPublicEffects,
  getPublicSubstanceBySlug,
  type PublicEffectSummary,
} from "@server/data/publicData";
import { getPublicSubstanceSlugs, getPublicSubstanceSlugsByCandidates } from "../data/publicData.substances";
import {
  buildArtistCreditLinks,
  type ArtistCreditLinks,
} from "../../src/features/effects/vcode/artistCreditLinks";
import { getMoleculeUpdatedAt, moleculeOverrideImageUrl } from "@server/data/publicData.molecules";
import { getCachedReagentDataForArticle } from "@server/reagentData";
import { getLocalizedPublicSubstanceBySlug } from "@server/translation/localizedSubstance";
import {
  getLocalizedPublicEffectBySlug,
} from "@server/translation/localizedRecords";
import { localizeRecords } from "@server/translation/liveTranslation";
import type { LiveLocale } from "./localeHostPolicy";
import { buildSubstanceSecondarySections, loadSubstanceSecondaryData } from "../../src/app/_components/public-routes/SubstanceSecondarySections";
import {
  getLocalizedWarningBannerPresets,
  getSafetyBannerIconSize,
  getWarningBannerPresets,
} from "./warningBanners";
import { getCopyByKeys } from "./copyBlocks";
import {
  CITATION_OVERHAUL_BANNER_KEY_PREFIX,
  resolveEnabledBanners,
} from "../../src/data/substanceWarningBanners";
import { substanceHasCitationNeeded } from "../../src/lib/citations/citationTokens";
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
  buildEffectMetadataDescription,
  buildEffectsIndexViewModel,
  buildSubstanceArticleViewModel,
  buildSubstanceMetadataDescription,
  buildSubstanceMetadataTitle,
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

import { slugify } from "../../src/utils/slug";

const ARTICLE_COPY_KEYS = [
  DOSAGE_PANEL_DISCLAIMER_KEY,
  TOLERANCE_SECTION_DISCLAIMER_KEY,
  REVIEW_STATUS_BANNER_KEY,
  EXPERT_REVIEW_CREDIT_KEY,
] as const;

function interactionCandidateSlugs(substance: SubstanceArticle): string[] {
  const interactions = substance.interactions;
  if (!interactions) return [];
  const names = [
    ...(interactions.dangerous ?? []),
    ...(interactions.unsafe ?? []),
    ...(interactions.caution ?? []),
  ];
  return [...new Set(names.map((item) => {
    const match = item.match(/^(.+?)\s*[(（](.+)[)）]$/);
    return slugify(match ? match[1].trim() : item);
  }).filter(Boolean))];
}
export type SubstanceRouteResult =
  | (OkRouteResult<SubstanceArticleViewModel["pageProps"]> & { publicRevision?: string })
  | RedirectRouteResult
  | NotFoundRouteResult;

const getSubstanceRouteIdentity = cache(async (slug: string, locale: LiveLocale | null) => {
  const aliasTarget = getSubstanceRouteAlias(slug);

  if (aliasTarget) {
    return {
      kind: "redirect" as const,
      target: getPublicRoutePath({ family: "substance", params: { slug: aliasTarget } }),
      metadata: {
        title: "Substance",
        description: `Redirecting to the canonical ${SITE_FLAVOR_CONFIG.name} substance page.`,
      },
      canonicalRoute: { family: "substance" as const, params: { slug } },
    };
  }

  const substance = locale
    ? await getLocalizedPublicSubstanceBySlug(slug, locale.code)
    : await getPublicSubstanceBySlug(slug);

  if (!substance) {
    return { kind: "not-found" } as const;
  }

  return { kind: "ok", substance } as const;
});

export const loadSubstanceMetadataRoute = cache(async (slug: string, locale: LiveLocale | null = null) => {
  const identity = await getSubstanceRouteIdentity(slug, locale);
  if (identity.kind !== "ok") return identity;
  return {
    kind: "ok",
    metadata: toRouteMetadata({
      title: buildSubstanceMetadataTitle(identity.substance),
      description: buildSubstanceMetadataDescription(identity.substance),
    }),
    canonicalRoute: { family: "substance", params: { slug } },
  } as const;
});

export const loadSubstanceRoute = cache(async (slug: string, locale: LiveLocale | null = null): Promise<SubstanceRouteResult> => {
  const identity = await getSubstanceRouteIdentity(slug, locale);
  if (identity.kind !== "ok") return identity;
  const { substance } = identity;

  const secondaryData = loadSubstanceSecondaryData(substance, slug, locale);
  // Only identity, linkability, molecule and safety data gate the article shell.
  const [
    moleculeUpdatedAt,
    linkableSubstanceSlugs,
    categoryLayout,
    externalReagentData,
    warningBannerPresets,
    warningBannerIconSize,
    copy,
  ] = await Promise.all([
    getMoleculeUpdatedAt(slug),
    // Slug set only: which wiki links resolve. The preview corpus would cost
    // 19 sequential round trips on a cold cache for the same answer.
    getPublicSubstanceSlugsByCandidates(interactionCandidateSlugs(substance as SubstanceArticle)),
    getPublicCategoryLayout(),
    getCachedReagentDataForArticle(substance, slug),
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
    getCopyByKeys(ARTICLE_COPY_KEYS),
  ]);

  // Editor draft previews re-render against mutable article data, so they need
  // resolved enrichment values rather than server nodes bound to the publication.
  // Keep that existing editor behavior without blocking the public artifact.
  const editorEnrichment = process.env.NEXT_PUBLIC_EDITOR_BUILD === "true"
    ? await Promise.all([
      secondaryData.directory,
      secondaryData.profiles,
      secondaryData.reports,
      secondaryData.history,
    ])
    : null;

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
    moleculeOverrideUrl,
    externalReagentData,
    ...buildSubstanceSecondarySections({
      article: substance as SubstanceArticle,
      slug,
      data: secondaryData,
      externalReagentData,
      reviewStatusCopy: copy.text(REVIEW_STATUS_BANNER_KEY),
      expertReviewCredit: copy.text(EXPERT_REVIEW_CREDIT_KEY),
    }),
    contributorDirectory: editorEnrichment?.[0],
    contributorAvatars: editorEnrichment
      ? { josie: editorEnrichment[1][0]?.avatarUrl ?? null, lyrea: editorEnrichment[1][1]?.avatarUrl ?? null }
      : undefined,
    hasRelatedTripReports: editorEnrichment ? editorEnrichment[2].totalReports > 0 : undefined,
    recentChanges: editorEnrichment?.[3],
    warningBanners,
    warningBannerIconSize,
    showBetaDisclaimer,
    dosageDisclaimer: copy.text(DOSAGE_PANEL_DISCLAIMER_KEY),
    toleranceDisclaimer: copy.text(TOLERANCE_SECTION_DISCLAIMER_KEY),
    reviewStatusCopy: copy.text(REVIEW_STATUS_BANNER_KEY),
    expertReviewCredit: copy.text(EXPERT_REVIEW_CREDIT_KEY),
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
  | OkRouteResult<EffectArticleViewModel["pageProps"]>
  | NotFoundRouteResult;

// Metadata and the page share the canonical/localized identity, without forcing
// optional article enrichments into metadata generation.
const getEffectRouteIdentity = cache(async (effectSlug: string, locale: LiveLocale | null) =>
  locale ? getLocalizedPublicEffectBySlug(effectSlug, locale.code) : getPublicEffectBySlug(effectSlug),
);

export const loadEffectMetadataRoute = cache(async (effectSlug: string, locale: LiveLocale | null = null) => {
  const effect = await getEffectRouteIdentity(effectSlug, locale);
  if (!effect) return { kind: "not-found" } as const;
  return {
    kind: "ok",
    metadata: toRouteMetadata({
      title: effect.name,
      description: buildEffectMetadataDescription(effect),
    }),
    canonicalRoute: { family: "effect", params: { effectSlug } },
  } as const;
});

export const loadEffectRoute = cache(async (effectSlug: string, locale: LiveLocale | null = null): Promise<EffectRouteResult> => {
  const effect = await getEffectRouteIdentity(effectSlug, locale);
  if (!effect) {
    return { kind: "not-found" };
  }

  const [linkableSubstanceSlugs, linkableEffectSlugs] = await Promise.all([
    getPublicSubstanceSlugs(),
    getPublicEffectSlugs(),
  ]);

  const viewModel = buildEffectArticleViewModel({
    effectSlug,
    effect,
    linkableSubstanceSlugs,
    linkableEffectSlugs,
  });

  return {
    kind: "ok",
    pageProps: viewModel.pageProps,
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "effect", params: { effectSlug } },
  };
});

/**
 * Selection matches on the English record (tags and English names), then the
 * localized article of the same slug stands in for the mirror so a translated
 * name never has to match the definition.
 */
function selectPsychoactiveSummaryEffects<T extends { slug: string; name: string; tags: string[] }>(
  effects: T[],
  selection: PsychoactiveSummarySelection,
): T[] {
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

  return selected;
}

export type PsychoactiveSummaryRouteResult =
  | OkRouteResult<{
      definition: PsychoactiveSummaryDefinition;
      sections: Array<
        PsychoactiveSummarySectionDefinition & {
          effects: PublicEffectSummary[];
        }
      >;
      artistCreditLinks: ArtistCreditLinks;
    }>
  | NotFoundRouteResult;


export const loadPsychoactiveSummaryMetadataRoute = cache((summaryPath: readonly string[]) => {
  const definition = getPsychoactiveSummaryDefinition(summaryPath);
  if (!definition) return { kind: "not-found" } as const;
  return {
    kind: "ok",
    metadata: {
      title: definition.metadataTitle,
      description: definition.metadataDescription,
    },
    canonicalRoute: {
      family: "psychoactiveSummary" as const,
      params: { summaryPath: [...definition.summaryPath] },
    },
  };
});
export const loadPsychoactiveSummaryRoute = cache(
  async (
    summaryPath: readonly string[],
    locale: LiveLocale | null = null,
  ): Promise<PsychoactiveSummaryRouteResult> => {
    const definition = getPsychoactiveSummaryDefinition(summaryPath);

    if (!definition) {
      return { kind: "not-found" };
    }

    const effects = await getPublicEffects();
    const selectedSections = definition.sections.map((section) => ({
      ...section,
      effects: selectPsychoactiveSummaryEffects(effects, section.selection),
    }));
    const selectedSlugs = [...new Set(selectedSections.flatMap((section) => section.effects.map((effect) => effect.slug)))];
    const [summaries, artistCredits] = await Promise.all([
      getPublicEffectSummariesBySlugs(selectedSlugs),
      getPublicArtistCreditRows(),
    ]);
    const localizedSummaries = locale
      ? (await localizeRecords(summaries, locale.code, "effect")).records
      : summaries;
    const summariesBySlug = new Map(localizedSummaries.map((effect) => [effect.slug, effect]));

    return {
      kind: "ok",
      pageProps: {
        definition,
        sections: selectedSections.map((section) => ({
          ...section,
          effects: section.effects.flatMap((effect) => {
            const summary = summariesBySlug.get(effect.slug);
            return summary ? [summary] : [];
          }),
        })),
        artistCreditLinks: buildArtistCreditLinks(artistCredits),
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
  const canonicalEffects = await getPublicEffectIndex();
  const effects = locale && canonicalEffects.length > 0
    ? (await localizeRecords(canonicalEffects, locale.code, "effect")).records
    : canonicalEffects;
  const viewModel = buildEffectsIndexViewModel({
    effectCount: effects.length,
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
