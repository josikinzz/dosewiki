import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ReportCardModel } from "@/types/tripReport";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { TripReportsExplorer } from "./TripReportsExplorer";
import {
  REPORTS_INDEX_DEFAULT_VIEW,
  type ReportsIndexView,
} from "@/utils/indexViewRoutes";

interface TripReportsPageProps {
  reports: ReportCardModel[];
  reportHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
  /** Server-resolved URL state for the first rendered grouping. */
  initialView?: ReportsIndexView;
}

/**
 * Experience reports index. The page owns orientation only: title, framing,
 * and the contribution invitation at the end, where a reader who has actually
 * read a report meets it. Everything between belongs to the explorer.
 */
export function TripReportsPage({
  reports,
  reportHrefPrefix,
  emptyState,
  initialView = REPORTS_INDEX_DEFAULT_VIEW,
}: TripReportsPageProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      // Unbounded width, matching the substance and effect indexes: the panel
      // grid measures its own container and takes as many 320px columns as the
      // monitor allows. Header and controls keep the reading measure.
      className="mx-auto w-full px-4 pb-20 pt-10 focus:outline-none md:px-8"
    >
      <PageHeader
        title="Experience Reports"
        icon={icons.fileSignature}
        description="First-person accounts of psychoactive experiences, published as their authors wrote them. Each one is a single person's experience, not dosing guidance."
        className="mx-auto mb-7 w-full max-w-4xl"
      />

      <TripReportsExplorer
        key={initialView}
        initialView={initialView}
        reports={reports}
        reportHrefPrefix={reportHrefPrefix}
        emptyState={emptyState}
      />

      <div className="mx-auto mt-16 w-full max-w-4xl">
        <div className="theme-horizontal-divider h-px" />
        <div
          className="mt-5 flex flex-wrap items-center justify-center gap-3"
          data-nosnippet
        >
          <Button variant="pill" size="pill" asChild>
            <Link href={publicHref.reportSubmission()}>
              <Icon icon="lucide:file-pen-line" size={16} />
              Submit a report
            </Link>
          </Button>
          <Button variant="quiet" size="quiet" asChild>
            <a href="#main-content">
              <Icon icon="lucide:arrow-up" size={15} />
              Back to top
            </a>
          </Button>
        </div>
      </div>
    </main>
  );
}
