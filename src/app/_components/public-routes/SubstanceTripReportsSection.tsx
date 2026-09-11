import { ArticleSection } from "@/components/common/ArticleSection";
import { TripReportsSection } from "@/features/article/components/sections/TripReportsSection";
import {
  getSubstanceSearchNames,
  prepareSubstanceTripReports,
} from "@/features/reports/domain/tripReportIndex";
import type { SubstanceArticle } from "@/schema";
import { getRequestLocale, t } from "@/i18n/server";
import { localizeRecords } from "@server/translation/liveTranslation";
import { icons } from "@/utils/iconNames";
import { getPublicReportsBySubstanceNames } from "@server/convex/publicData";
import { getSectionLoadingModel, RouteLoadingSkeleton } from "../RouteLoading";

export async function SubstanceTripReportsSection({
  article,
  slug,
}: {
  article: SubstanceArticle;
  slug: string;
}) {
  const englishReports = await getPublicReportsBySubstanceNames(getSubstanceSearchNames(article));
  // The mirror splices the stored report translations in here too; the
  // report index and detail routes read the same segments.
  const locale = getRequestLocale();
  const relatedTripReports = locale === "en"
    ? englishReports
    : (await localizeRecords(englishReports, locale, "report")).records;
  const preparedReports = prepareSubstanceTripReports(relatedTripReports, {
    article,
    collapsedLimit: 3,
    minHiddenForCollapse: 3,
  });

  return <TripReportsSection preparedReports={preparedReports} fromSubstanceSlug={slug} />;
}

export function SubstanceTripReportsSectionFallback() {
  return (
    <ArticleSection
      id="trip-reports"
      icon={icons.fileSignature}
      heading={t("Trip Reports")}
      aria-busy="true"
      aria-live="polite"
    >
      <RouteLoadingSkeleton
        model={getSectionLoadingModel({
          key: "substance-trip-reports",
          label: t("Loading related reports"),
          variant: "list",
        }, t)}
      />
    </ArticleSection>
  );
}
