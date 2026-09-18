import { msg } from "../../src/i18n/messages";
import "server-only";

import { Suspense, type ReactNode } from "react";
import { getPublicEffectDetail } from "@server/data/publicLibrary";
import {
  EffectReplicationsSection,
  EffectReplicationsSectionFallback,
} from "../../src/app/_components/public-routes/EffectReplicationsSection";
import { SubstanceReplicationShowcaseSection } from "../../src/app/_components/public-routes/SubstanceReplicationShowcaseSection";
import { buildSubstanceRecord } from "../../src/data/builders/contentBuilder";
import { SITE_FLAVOR_CONFIG } from "../../src/config/siteFlavor";
import type { ContributorDirectory } from "../contributorDirectory";
import type { ContributorAvatarMap } from "../../src/features/article/components/sections/ContributorsSection";
import type { ArticleRecentChange } from "../../src/data/changelog/articleRecentChanges";
import type { ArticleSecondarySections } from "../../src/features/article/components/ArticleLayout";
import {
  buildEffectArticleModel,
  getEffectArticleReplicationState,
  type EffectArticleModel,
} from "../../src/features/effects/articleSectionModel";
import { stripCitationTokens } from "../../src/lib/citations/citationTokens";
import type { SubstanceArticle } from "../../src/schema";
import type { MoleculeAsset, SubstanceContent } from "../../src/types/content";
import type { NormalizedReagentData } from "../../src/types/reagent";
import type { WarningBannerPreset } from "../../src/data/substanceWarningBanners";
import type { ReportCardModel } from "../../src/types/tripReport";
import type {
  PublicEffectIndexEntry,
  SubjectiveEffectDetailRecord,
} from "../data/publicData";
import type { PublicSubstanceRecord } from "../data/publicData.shared";

const REPORT_HREF_PREFIX = "/reports/";
const EFFECT_HREF_PREFIX = "/effects/";
const DRUG_HREF_PREFIX = "/";
const CATEGORY_HREF_PREFIX = "/category/";

export function buildMetadataDescription(text: string): string {
  return stripCitationTokens(text).replace(/\s+([.,;:!?])/g, "$1");
}

function compactStrings(
  values: readonly (string | null | undefined)[],
): string[] {
  return values.flatMap((value) => {
    const cleaned = value?.replace(/\s+/g, " ").trim();
    return cleaned ? [cleaned] : [];
  });
}

export function buildSubstanceMetadataDescription(
  substance: PublicSubstanceRecord,
): string {
  const summary = buildMetadataDescription(substance.summary ?? "");

  if (summary) {
    return summary;
  }

  const name = substance.identification?.common_name?.trim() || substance.title;
  const classifications = compactStrings([
    ...(substance.classification?.psychoactive_class ?? []),
    ...(substance.classification?.chemical_class ?? []),
  ]);
  const classPhrase =
    classifications.length > 0
      ? ` in the ${classifications.join(", ")} class`
      : "";

  return `${name} substance profile${classPhrase} covering dosage, duration, effects, interactions, tolerance, harm potential, legality, and references.`;
}

/** Bare page name only — buildPublicPageMetadata owns the " - <suffix>" tail. */
export function buildSubstanceMetadataTitle(substance: PublicSubstanceRecord): string {
  return (
    substance.identification?.common_name?.trim() ||
    substance.title.trim() ||
    "Substance"
  );
}

export function buildEffectMetadataDescription(
  effect: SubjectiveEffectDetailRecord,
): string {
  const prose = compactStrings([
    effect.summary,
    effect.description_raw,
    effect.long_summary_raw,
    effect.analysis_raw,
  ])
    .map(buildMetadataDescription)
    .find(Boolean);

  if (prose) {
    return prose;
  }

  return `${effect.name} subjective effect profile covering description, analysis, replications, related substances, and citations.`;
}

export interface PublicPageMetadataSource {
  title: string;
  description: string;
}

export interface ReportsIndexViewModel {
  metadata: PublicPageMetadataSource;
  pageProps: {
    reportHrefPrefix: string;
    reports: ReportCardModel[];
  };
}

export interface EffectsIndexSummary {
  slug: string;
  name: string;
  tags: string[];
}

export interface EffectsIndexViewModel {
  metadata: PublicPageMetadataSource;
  pageProps: {
    effectHrefPrefix: string;
    effects: EffectsIndexSummary[];
  };
}

export interface SubstanceArticleViewModel {
  metadata: PublicPageMetadataSource;
  pageProps: {
    article: SubstanceArticle;
    content?: SubstanceContent;
    fromSubstanceSlug: string;
    linkableSubstanceSlugs: string[];
    linkableCategoryKeys: string[];
    tripReportsSection: ReactNode;
    hasRelatedTripReports?: boolean;
    replicationShowcaseSection: ReactNode;
    secondarySections?: ArticleSecondarySections;
    contributorAvatars?: ContributorAvatarMap;
    contributorDirectory: ContributorDirectory;
    externalReagentData?: NormalizedReagentData | null;
    warningBanners: WarningBannerPreset[];
    /**
     * The site-wide banner glyph size. Optional, unlike `warningBanners`: a
     * caller that omits it renders at `SAFETY_BANNER_ICON_SIZE_DEFAULT`, which is
     * the size the site shipped with, whereas omitting the banners themselves
     * would silently drop a warning.
     */
    warningBannerIconSize?: number;
    /**
     * Render the sitewide beta disclaimer in place of the stored citation
     * overhaul banner. True once the citation audit has stripped a refuted
     * marker on this article (`substanceHasCitationNeeded` in the loader).
     */
    showBetaDisclaimer?: boolean;
    /**
     * The article's two disclaimer copy blocks. Optional for the same reason as
     * the glyph size: an omitted body renders the checked-in default sentence,
     * not a bare table.
     */
    dosageDisclaimer?: string;
    toleranceDisclaimer?: string;
    reviewStatusCopy?: string;
    expertReviewCredit?: string;
    recentChanges?: ArticleRecentChange[];
  };
}

export interface EffectArticleViewModel {
  metadata: PublicPageMetadataSource;
  pageProps: {
    sourceEffect: SubjectiveEffectDetailRecord;
    article: EffectArticleModel;
    drugHrefPrefix: string;
    categoryHrefPrefix: string;
    linkableSubstanceSlugs: string[];
    linkableEffectSlugs: string[];
    replicationsSection?: ReactNode;
    contributorDirectory: ContributorDirectory;
  };
}

export function buildReportsIndexViewModel(input: {
  reportCount: number;
  reports: ReportCardModel[];
}): ReportsIndexViewModel {
  return {
    metadata: {
      title: msg("Experience Reports Index"),
      description: `Browse ${input.reportCount} trip reports in ${SITE_FLAVOR_CONFIG.name}.`,
    },
    pageProps: {
      reportHrefPrefix: REPORT_HREF_PREFIX,
      reports: input.reports,
    },
  };
}

export function buildEffectsIndexViewModel(input: {
  effectCount: number;
  effects: PublicEffectIndexEntry[];
}): EffectsIndexViewModel {
  return {
    metadata: {
      title: msg("Subjective Effect Index"),
      description: `Browse ${input.effectCount} subjective effect entries in ${SITE_FLAVOR_CONFIG.name}.`,
    },
    pageProps: {
      effectHrefPrefix: EFFECT_HREF_PREFIX,
      effects: input.effects.map(toEffectsIndexSummary),
    },
  };
}

/**
 * Attach the canonical Postgres depiction as the article's only molecule asset.
 * No override row means no depiction: the content builder emits none.
 */
function applyMoleculeOverrideUrl(
  content: SubstanceContent | undefined,
  overrideUrl: string | null | undefined,
  slug: string,
): SubstanceContent | undefined {
  if (!content || !overrideUrl) {
    return content;
  }
  const primary: MoleculeAsset = {
    filename: `${slug}.svg`,
    url: overrideUrl,
    matchedField: "data-molecule",
    matchedValue: slug,
    resolution: "data-canonical",
  };
  return {
    ...content,
    moleculeAsset: primary,
    moleculeAssets: [primary],
  };
}

export function buildSubstanceArticleViewModel(input: {
  slug: string;
  substance: PublicSubstanceRecord;
  linkableSubstanceSlugs: string[];
  linkableCategoryKeys: string[];
  tripReportsSection: ReactNode;
  replicationShowcaseSection?: ReactNode;
  secondarySections?: ArticleSecondarySections;
  contributorAvatars?: ContributorAvatarMap;
  contributorDirectory?: ContributorDirectory;
  moleculeOverrideUrl?: string | null;
  externalReagentData?: NormalizedReagentData | null;
  hasRelatedTripReports?: boolean;
  /**
   * Already narrowed to this slug by `resolveEnabledBanners`. Required, not
   * defaulted: a caller that forgets it should fail to compile rather than
   * silently publish an article missing a safety banner an editor switched on.
   */
  warningBanners: WarningBannerPreset[];
  /** Site-wide glyph size from `getSafetyBannerIconSize`; omitted renders at the default. */
  warningBannerIconSize?: number;
  /** See the pageProps field: swaps the citation banner for the beta disclaimer. */
  showBetaDisclaimer?: boolean;
  /**
   * The `dosage-panel-disclaimer` and `tolerance-section-disclaimer` bodies;
   * omitted renders the checked-in defaults. Unlike the banners, a missing one
   * costs the reader nothing an editor chose — the sentence is the same either
   * way.
   */
  dosageDisclaimer?: string;
  toleranceDisclaimer?: string;
  /** The `review-status-banner` and `expert-review-credit` bodies; same contract. */
  reviewStatusCopy?: string;
  expertReviewCredit?: string;
  /** Human edits against this article, resolved by the route loader. */
  recentChanges?: ArticleRecentChange[];
}): SubstanceArticleViewModel {
  const { slug: _resolvedSlug, ...article } = input.substance;
  const publicArticle = article as SubstanceArticle;

  return {
    metadata: {
      title: buildSubstanceMetadataTitle(input.substance),
      description: buildSubstanceMetadataDescription(input.substance),
    },
    pageProps: {
      article: publicArticle,
      content: applyMoleculeOverrideUrl(
        buildSubstanceRecord(publicArticle)?.content,
        input.moleculeOverrideUrl,
        input.slug,
      ),
      fromSubstanceSlug: input.slug,
      linkableSubstanceSlugs: input.linkableSubstanceSlugs,
      linkableCategoryKeys: input.linkableCategoryKeys,
      hasRelatedTripReports: input.hasRelatedTripReports,
      tripReportsSection: input.tripReportsSection,
      secondarySections: input.secondarySections,
      replicationShowcaseSection: input.replicationShowcaseSection ?? (
        <Suspense fallback={null}>
          <SubstanceReplicationShowcaseSection slug={input.slug} />
        </Suspense>
      ),
      contributorAvatars: input.contributorAvatars,
      contributorDirectory: input.contributorDirectory ?? [],
      externalReagentData: input.externalReagentData,
      warningBanners: input.warningBanners,
      warningBannerIconSize: input.warningBannerIconSize,
      showBetaDisclaimer: input.showBetaDisclaimer,
      dosageDisclaimer: input.dosageDisclaimer,
      toleranceDisclaimer: input.toleranceDisclaimer,
      reviewStatusCopy: input.reviewStatusCopy,
      expertReviewCredit: input.expertReviewCredit,
      recentChanges: input.recentChanges,
    },
  };
}

export function buildEffectArticleViewModel(input: {
  effectSlug: string;
  effect: SubjectiveEffectDetailRecord;
  detail?: Awaited<ReturnType<typeof getPublicEffectDetail>> | null;
  replicationsSection?: ReactNode;
  contributorDirectory?: ContributorDirectory;
  linkableSubstanceSlugs: string[];
  linkableEffectSlugs: string[];
}): EffectArticleViewModel {
  const replicationState = getEffectArticleReplicationState(input.effect);
  const article = buildEffectArticleModel({
    effect: input.effect,
    effectDetail: input.detail ?? undefined,
    replications: replicationState,
  });

  return {
    metadata: {
      title: input.effect.name,
      description: buildEffectMetadataDescription(input.effect),
    },
    pageProps: {
      sourceEffect: input.effect,
      article,
      drugHrefPrefix: DRUG_HREF_PREFIX,
      categoryHrefPrefix: CATEGORY_HREF_PREFIX,
      linkableSubstanceSlugs: input.linkableSubstanceSlugs,
      linkableEffectSlugs: input.linkableEffectSlugs,
      replicationsSection:
        input.replicationsSection ??
        (replicationState.kind === "server" ? (
          <Suspense fallback={<EffectReplicationsSectionFallback />}>
            <EffectReplicationsSection effectSlug={input.effectSlug} />
          </Suspense>
        ) : undefined),
      contributorDirectory: input.contributorDirectory ?? [],
    },
  };
}

export function toEffectsIndexSummary(
  effect: PublicEffectIndexEntry,
): EffectsIndexSummary {
  return {
    slug: effect.slug,
    name: effect.name,
    tags: effect.tags ?? [],
  };
}
