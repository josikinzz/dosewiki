import "server-only";

import { Suspense, type ReactNode } from "react";
import { getPublicEffectDetail } from "@server/convex/publicLibrary";
import {
  EffectReplicationsSection,
  EffectReplicationsSectionFallback,
} from "../../src/app/_components/public-routes/EffectReplicationsSection";
import {
  SubstanceTripReportsSection,
  SubstanceTripReportsSectionFallback,
} from "../../src/app/_components/public-routes/SubstanceTripReportsSection";
import { buildSubstanceRecord } from "../../src/data/builders/contentBuilder";
import type { ContributorAvatarMap } from "../../src/features/article/components/sections/ContributorsSection";
import {
  buildEffectArticleModel,
  getEffectArticleReplicationState,
  type EffectArticleModel,
} from "../../src/features/effects/articleSectionModel";
import { stripCitationTokens } from "../../src/lib/citations/referenceModel";
import { toTripReportPreviewModel } from "../../src/features/reports/domain/tripReportIndex";
import type { SubstanceArticle } from "../../src/schema";
import type { MoleculeAsset, SubstanceContent } from "../../src/types/content";
import type { ReportCardModel } from "../../src/types/tripReport";
import type {
  PublicEffectPreview,
  PublicReportPreview,
  SubjectiveEffectDetailRecord,
} from "../convex/publicData";
import type { PublicSubstanceRecord } from "../convex/publicData.shared";

const REPORT_HREF_PREFIX = "/reports/";
const EFFECT_HREF_PREFIX = "/effects/";
const DRUG_HREF_PREFIX = "/";
const CATEGORY_HREF_PREFIX = "/category/";

export function buildMetadataDescription(text: string): string {
  return stripCitationTokens(text).replace(/\s+([.,;:!?])/g, "$1");
}

function compactStrings(values: readonly (string | null | undefined)[]): string[] {
  return values.flatMap((value) => {
    const cleaned = value?.replace(/\s+/g, " ").trim();
    return cleaned ? [cleaned] : [];
  });
}

function buildSubstanceMetadataDescription(substance: PublicSubstanceRecord): string {
  const summary = buildMetadataDescription(substance.summary ?? "");

  if (summary) {
    return summary;
  }

  const name = substance.identification?.common_name?.trim() || substance.title;
  const classifications = compactStrings([
    ...(substance.classification?.psychoactive_class ?? []),
    ...(substance.classification?.chemical_class ?? []),
  ]);
  const classPhrase = classifications.length > 0 ? ` in the ${classifications.join(", ")} class` : "";

  return `${name} substance profile${classPhrase} covering dosage, duration, effects, interactions, tolerance, harm potential, legality, and references.`;
}

function buildSubstanceMetadataTitle(substance: PublicSubstanceRecord): string {
  const name = substance.identification?.common_name?.trim() || substance.title.trim() || "Substance";

  return `${name} dosage, effects, and safety`;
}

function buildEffectMetadataDescription(effect: SubjectiveEffectDetailRecord): string {
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
    tripReportsSection: ReactNode;
    contributorAvatars?: ContributorAvatarMap;
  };
}

export interface EffectArticleViewModel {
  metadata: PublicPageMetadataSource;
  pageProps: {
    sourceEffect: SubjectiveEffectDetailRecord;
    article: EffectArticleModel;
    drugHrefPrefix: string;
    categoryHrefPrefix: string;
    replicationsSection?: ReactNode;
  };
}

export function buildReportsIndexViewModel(input: {
  reportCount: number;
  reports: PublicReportPreview[];
}): ReportsIndexViewModel {
  return {
    metadata: {
      title: `Reports · ${input.reportCount} entries`,
      description: `Browse ${input.reportCount} trip reports in dose.wiki.`,
    },
    pageProps: {
      reportHrefPrefix: REPORT_HREF_PREFIX,
      reports: input.reports.map(toTripReportPreviewModel),
    },
  };
}

export function buildEffectsIndexViewModel(input: {
  effectCount: number;
  effects: PublicEffectPreview[];
}): EffectsIndexViewModel {
  return {
    metadata: {
      title: `Effects · ${input.effectCount} records`,
      description: `Browse ${input.effectCount} subjective effect entries in dose.wiki.`,
    },
    pageProps: {
      effectHrefPrefix: EFFECT_HREF_PREFIX,
      effects: input.effects.map(toEffectsIndexSummary),
    },
  };
}

/**
 * When a substance has a hand-authored molecule override, point its primary
 * molecule image at the live override URL instead of the static asset. The rest
 * of the content (and any secondary molecule assets) is left untouched.
 */
function applyMoleculeOverrideUrl(
  content: SubstanceContent | undefined,
  overrideUrl: string | null | undefined,
): SubstanceContent | undefined {
  if (!content || !overrideUrl) {
    return content;
  }
  const assets = content.moleculeAssets;
  if (!assets || assets.length === 0) {
    return content;
  }
  const primary: MoleculeAsset = { ...assets[0], url: overrideUrl };
  return {
    ...content,
    moleculeAsset: primary,
    moleculeAssets: [primary, ...assets.slice(1)],
  };
}

export function buildSubstanceArticleViewModel(input: {
  slug: string;
  substance: PublicSubstanceRecord;
  tripReportsSection?: ReactNode;
  contributorAvatars?: ContributorAvatarMap;
  moleculeOverrideUrl?: string | null;
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
      ),
      fromSubstanceSlug: input.slug,
      tripReportsSection:
        input.tripReportsSection ??
        (
          <Suspense fallback={<SubstanceTripReportsSectionFallback />}>
            <SubstanceTripReportsSection article={publicArticle} slug={input.slug} />
          </Suspense>
        ),
      contributorAvatars: input.contributorAvatars,
    },
  };
}

export function buildEffectArticleViewModel(input: {
  effectSlug: string;
  effect: SubjectiveEffectDetailRecord;
  detail?: Awaited<ReturnType<typeof getPublicEffectDetail>> | null;
  replicationsSection?: ReactNode;
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
      replicationsSection:
        input.replicationsSection ??
        (replicationState.kind === "server" ? (
          <Suspense fallback={<EffectReplicationsSectionFallback />}>
            <EffectReplicationsSection
              effectSlug={input.effectSlug}
              galleryOrder={replicationState.galleryOrder}
            />
          </Suspense>
        ) : undefined),
    },
  };
}

export function toEffectsIndexSummary(effect: PublicEffectPreview): EffectsIndexSummary {
  return {
    slug: effect.slug,
    name: effect.name,
    tags: effect.tags ?? [],
  };
}
