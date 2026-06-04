import { memo } from "react";

import type { ReportCardModel } from "@/types/tripReport";
import { TripReportCard } from "./TripReportCard";

interface ReportCardProps {
  report: ReportCardModel;
  href?: string;
  onClick?: () => void;
}

/**
 * Compatibility wrapper for report list cards.
 */
export const ReportCard = memo(function ReportCard({
  report,
  href,
  onClick,
}: ReportCardProps) {
  return <TripReportCard report={report} href={href} onClick={onClick} />;
});
