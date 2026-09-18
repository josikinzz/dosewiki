import { TripReportsSection } from "@/features/article/components/sections/TripReportsSection";
import type { PreparedSubstanceTripReports } from "@/features/reports/domain/tripReportIndex";
import type { ReportCardModel } from "@/types/tripReport";

export function SubstanceTripReportsSection({
  preparedReports,
  slug,
}: {
  preparedReports: PreparedSubstanceTripReports<ReportCardModel>;
  slug: string;
}) {
  return <TripReportsSection preparedReports={preparedReports} fromSubstanceSlug={slug} />;
}

