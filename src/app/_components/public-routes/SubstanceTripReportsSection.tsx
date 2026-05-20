import { SectionHeader } from "@/components/common/SectionHeader";
import { TripReportsSection } from "@/features/article/components/sections/TripReportsSection";
import {
  getSubstanceSearchNames,
  prepareSubstanceTripReports,
} from "@/features/reports/domain/tripReportIndex";
import type { SubstanceArticle } from "@/schema";
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
  });

  return <TripReportsSection preparedReports={preparedReports} fromSubstanceSlug={slug} />;
}

export function SubstanceTripReportsSectionFallback() {
  return (
    <section id="trip-reports" className="space-y-6 pt-12 scroll-mt-6" aria-busy="true" aria-live="polite">
      <SectionHeader icon="lucide:file-signature" title="Trip Reports" />
      <RouteLoadingSkeleton
        model={getSectionLoadingModel({
          key: "substance-trip-reports",
          label: "Loading related reports",
          variant: "list",
        })}
      />
    </section>
  );
}
