import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ReportCardModel } from "@/types/tripReport";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { TripReportsExplorer } from "./TripReportsExplorer";

interface TripReportsPageProps {
  reports: ReportCardModel[];
  reportHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
}

/**
 * Trip reports listing page with view mode selector.
 */
export function TripReportsPage({
  reports,
  reportHrefPrefix,
  emptyState,
}: TripReportsPageProps) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 focus:outline-none">
      <PageHeader
        title="Trip Reports"
        icon={icons.fileSignature}
        prominentMobileIcon
        showSpotlight={false}
        description="A collection of high-quality, consistently formatted trip reports documenting subjective experiences with various substances. These reports serve as anecdotal accounts supporting the documented effects in our Subjective Effect Index."
      />

      <div className="mb-8 flex justify-center">
        <Button
          variant="accent"
          size="pill"
          asChild
          className="min-h-11 rounded-full px-5 py-2.5 font-semibold"
        >
          <Link href={publicHref.reportSubmission()}>
            <Icon icon="lucide:file-pen-line" size={16} />
            Submit report
          </Link>
        </Button>
      </div>

      <TripReportsExplorer
        reports={reports}
        reportHrefPrefix={reportHrefPrefix}
        emptyState={emptyState}
      />
    </main>
  );
}
