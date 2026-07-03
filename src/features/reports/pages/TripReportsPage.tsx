import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ReportCardModel } from "@/types/tripReport";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { TripReportsExplorer } from "./TripReportsExplorer";

const reportsDescription = (
  <>
    First-person accounts of substance experiences, consistently formatted and
    cross-referenced with the{" "}
    <Link href={publicHref.effects()} className={proseLinkClassName}>
      Subjective Effect Index
    </Link>
    .
  </>
);

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
        className="mb-7"
        description={reportsDescription}
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
