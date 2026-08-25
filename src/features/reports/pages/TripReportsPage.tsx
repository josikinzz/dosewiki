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
 * Experience reports listing page with view mode selector.
 */
export function TripReportsPage({
  reports,
  reportHrefPrefix,
  emptyState,
}: TripReportsPageProps) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 focus:outline-none">
      <PageHeader
        title="Experience Reports"
        icon={icons.fileSignature}
        prominentMobileIcon
        className="mb-7"
      />

      <div className="mb-4 flex justify-center" data-nosnippet>
        <Button variant="accent" size="pillLg" asChild>
          <Link href={publicHref.reportSubmission()}>
            <Icon icon="lucide:file-pen-line" size={16} />
            Submit a report
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
