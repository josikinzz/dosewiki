"use client";

import { msg } from "@/i18n/client";
import { publicHref } from "@/utils/publicHref";
import { RouteErrorPage } from "../../_components/RouteErrorPage";

export default function ReportSubmissionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorPage
      error={error}
      reset={reset}
      boundary="report-submission"
      recovery={{ href: publicHref.reports(), label: msg("Back to Reports") }}
    />
  );
}
