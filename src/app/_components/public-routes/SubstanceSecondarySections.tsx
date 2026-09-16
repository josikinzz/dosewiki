import "server-only";

import { Suspense } from "react";
import {
  getPublicContributorByKey,
  getPublicContributorDirectory,
  getPublicReportsBySubstanceNames,
} from "@server/data/publicData";
import { getPublicArticleHistory } from "@server/data/publicData.changelog";
import { resolveContributorHref } from "@server/contributorDirectory";
import { localizeRecords } from "@server/translation/liveTranslation";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import { t } from "@/i18n/server";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";
import type { PreparedSubstanceTripReports } from "@/features/reports/domain/tripReportIndex";
import type { ReportCardModel } from "@/types/tripReport";
import type { SubstanceArticle } from "@/schema";
import type { NormalizedReagentData } from "@/types/reagent";
import { toReportCardModel } from "@/types/tripReport";
import { hasDisplayableReagentData } from "@/lib/reagentTesting";
import {
  getSubstanceSearchNames,
  prepareSubstanceTripReports,
} from "@/features/reports/domain/tripReportIndex";
import { ContributorsSection } from "@/features/article/components/sections/ContributorsSection";
import { ReviewStatusBanner } from "@/features/article/components/sections/ReviewStatusBanner";
import { SubjectiveEffectsAttribution } from "@/features/article/components/sections/SubjectiveEffectsSection";
import { TableOfContentsSection } from "@/features/article/components/sections/TableOfContentsSection";
import { buildArticleTableOfContentsItems } from "@/features/article/components/sections/tableOfContentsModel";
import { SubstanceTripReportsSection } from "./SubstanceTripReportsSection";

export interface SubstanceSecondaryData {
  directory: Promise<ContributorDirectory>;
  profiles: Promise<
    [NormalizedUserProfile | null, NormalizedUserProfile | null]
  >;
  reports: Promise<PreparedSubstanceTripReports<ReportCardModel>>;
  history: Promise<ArticleRecentChange[]>;
}

/** Start independent enrichments alongside the loader's safety-critical reads. */
export function loadSubstanceSecondaryData(
  article: Pick<SubstanceArticle, "title" | "identification">,
  slug: string,
  locale: LiveLocale | null,
): SubstanceSecondaryData {
  const directory = getPublicContributorDirectory();
  const profiles = Promise.all([
    getPublicContributorByKey("JOSIE"),
    getPublicContributorByKey("LYREA"),
  ]);
  const reports = getPublicReportsBySubstanceNames(
    getSubstanceSearchNames(article),
  ).then(async (rows) => {
    const localized = locale
      ? (await localizeRecords(rows, locale.code, "report")).records
      : rows;
    return prepareSubstanceTripReports(localized.map(toReportCardModel), {
      article,
      collapsedLimit: 3,
      minHiddenForCollapse: 3,
    });
  });
  const history = directory.then((entries) =>
    getPublicArticleHistory(slug, entries),
  );
  // Observe speculative failures now; the original promises still reject when
  // their server sections consume them, preserving React's error handling.
  for (const pending of [directory, profiles, reports, history]) {
    void pending.catch(() => undefined);
  }
  return { directory, profiles, reports, history };
}

type SectionProps = {
  article: SubstanceArticle;
  slug: string;
  data: SubstanceSecondaryData;
  externalReagentData?: NormalizedReagentData | null;
  reviewStatusCopy?: string;
  expertReviewCredit?: string;
};

async function RelatedReports({ data, slug }: SectionProps) {
  return (
    <SubstanceTripReportsSection
      preparedReports={await data.reports}
      slug={slug}
    />
  );
}

async function ReportsToc({
  article,
  externalReagentData,
  data,
  variant,
}: SectionProps & { variant: "bare" | "strip" }) {
  const reports = await data.reports;
  const items = buildArticleTableOfContentsItems(article, t, {
    hasExternalReagentData: hasDisplayableReagentData(externalReagentData),
    isLoadingExternalReagentData: false,
    hasTripReports: reports.totalReports > 0,
  });
  return <TableOfContentsSection items={items} variant={variant} />;
}

async function ReviewCredit({ article, data, reviewStatusCopy }: SectionProps) {
  const [directory, [, lyrea]] = await Promise.all([
    data.directory,
    data.profiles,
  ]);
  return (
    <ReviewStatusBanner
      article={article}
      avatarSrc={lyrea?.avatarUrl}
      profileHref={resolveContributorHref("Lyrea", directory)}
      copy={reviewStatusCopy}
    />
  );
}

async function Contributors({
  article,
  data,
  reviewStatusCopy,
  expertReviewCredit,
}: SectionProps) {
  const [directory, [josie, lyrea], recentChanges] = await Promise.all([
    data.directory,
    data.profiles,
    data.history,
  ]);
  return (
    <ContributorsSection
      article={article}
      avatars={{ josie: josie?.avatarUrl, lyrea: lyrea?.avatarUrl }}
      profileHrefs={{
        josie: resolveContributorHref("Josie Kins", directory),
        lyrea: resolveContributorHref("Lyrea", directory),
      }}
      reviewStatusCopy={reviewStatusCopy}
      expertReviewCredit={expertReviewCredit}
      recentChanges={recentChanges}
    />
  );
}

async function EffectsAttribution({ article, data }: SectionProps) {
  const directory = await data.directory;
  const author = article.subjective_effects.attribution?.author;
  return (
    <SubjectiveEffectsAttribution
      article={article}
      attributionHref={
        author ? resolveContributorHref(author, directory) : null
      }
      hasShowcase
    />
  );
}

export function buildSubstanceSecondarySections(props: SectionProps) {
  const {
    article,
    slug,
    externalReagentData,
    reviewStatusCopy,
    expertReviewCredit,
  } = props;
  const tocFallback = (variant: "bare" | "strip") => (
    <TableOfContentsSection
      items={buildArticleTableOfContentsItems(article, t, {
        hasExternalReagentData: hasDisplayableReagentData(externalReagentData),
        isLoadingExternalReagentData: false,
      })}
      variant={variant}
    />
  );
  return {
    tripReportsSection: (
      <Suspense fallback={null}>
        <RelatedReports {...props} />
      </Suspense>
    ),
    secondarySections: {
      toc: (
        <Suspense fallback={tocFallback("bare")}>
          <ReportsToc {...props} variant="bare" />
        </Suspense>
      ),
      tocStrip: (
        <Suspense fallback={tocFallback("strip")}>
          <ReportsToc {...props} variant="strip" />
        </Suspense>
      ),
      reviewStatus: (
        <Suspense
          fallback={
            <ReviewStatusBanner article={article} copy={reviewStatusCopy} />
          }
        >
          <ReviewCredit {...props} />
        </Suspense>
      ),
      contributors: (
        <Suspense
          fallback={
            <ContributorsSection
              article={article}
              reviewStatusCopy={reviewStatusCopy}
              expertReviewCredit={expertReviewCredit}
            />
          }
        >
          <Contributors {...props} />
        </Suspense>
      ),
      subjectiveEffectsAttribution: (
        <Suspense
          fallback={
            <SubjectiveEffectsAttribution article={article} hasShowcase />
          }
        >
          <EffectsAttribution {...props} />
        </Suspense>
      ),
    },
  };
}
