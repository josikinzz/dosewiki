import { memo } from "react";

import type { ReportCardModel } from "@/types/tripReport";
import {
  TripReportCard,
  type TripReportCardSurfaceTone,
} from "./TripReportCard";

interface ReportCardProps {
  report: ReportCardModel;
  href?: string;
  onClick?: () => void;
  surfaceTone?: TripReportCardSurfaceTone;
}

/**
 * Compatibility wrapper for report list cards.
 */
export const ReportCard = memo(function ReportCard({
  report,
  href,
  onClick,
  surfaceTone,
}: ReportCardProps) {
  return (
    <TripReportCard
      report={report}
      href={href}
      onClick={onClick}
      surfaceTone={surfaceTone}
    />
  );
});
