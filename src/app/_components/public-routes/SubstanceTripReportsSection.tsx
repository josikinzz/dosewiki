import { ArticleSection } from "@/components/common/ArticleSection";
import { TripReportsSection } from "@/features/article/components/sections/TripReportsSection";
import {
  getSubstanceSearchNames,
  prepareSubstanceTripReports,
} from "@/features/reports/domain/tripReportIndex";
import type { SubstanceArticle } from "@/schema";
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
  const relatedTripReports = await getPublicReportsBySubstanceNames(getSubstanceSearchNames(article));
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
      heading="Trip Reports"
      aria-busy="true"
      aria-live="polite"
    >
      <RouteLoadingSkeleton
        model={getSectionLoadingModel({
          key: "substance-trip-reports",
          label: "Loading related reports",
          variant: "list",
        })}
      />
    </ArticleSection>
  );
}
