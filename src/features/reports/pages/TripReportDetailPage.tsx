import "server-only";

import { t } from "@/i18n/server";
import PublishedReportEditor from "../editing/PublishedReport.editor";
import { TripReportDetailPresentation, type TripReportDetailPageProps } from "./TripReportDetailPresentation";

export function TripReportDetailPage(props: Omit<TripReportDetailPageProps, "t" | "editor">) {
  return (
    <TripReportDetailPresentation
      {...props}
      t={t}
      editor={process.env.NEXT_PUBLIC_EDITOR_BUILD === "true" && !props.preview
        ? <PublishedReportEditor report={props.report} substanceBySlug={props.substanceBySlug} substanceLinks={props.substanceLinks} />
        : null}
    />
  );
}
