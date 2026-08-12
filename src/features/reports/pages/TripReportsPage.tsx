import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { renderInlineCopy } from "@/components/common/InlineCopy";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ReportCardModel } from "@/types/tripReport";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { TripReportsExplorer } from "./TripReportsExplorer";

/**
 * Shipped before the copy CMS existed, and still the fallback: the Convex row
 * and the checked-in copy default both hold this exact sentence.
 */
const REPORTS_INTRO_FALLBACK = `First-person accounts of substance experiences, consistently formatted and cross-referenced with the [Subjective Effect Index](${publicHref.effects()}).`;

interface TripReportsPageProps {
  reports: ReportCardModel[];
  reportHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
  /** Editable index intro; `[label](/href)` links are rendered inline. */
  intro?: string;
}

/**
 * Trip reports listing page with view mode selector.
 */
export function TripReportsPage({
  reports,
  reportHrefPrefix,
  emptyState,
  intro,
}: TripReportsPageProps) {
  const reportsDescription = renderInlineCopy(intro || REPORTS_INTRO_FALLBACK);
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
