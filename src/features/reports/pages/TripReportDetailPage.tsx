import Link from "next/link";
import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Button } from "@/components/ui/button";
import { ReportDossier } from "../components/ReportDossier";
import { TimelineSection } from "../components/TimelineSection";
import { TextSection } from "../components/TextSection";
import { ReportHeroSection } from "../components/ReportHeroSection";
import type { TripReport } from "@/types/tripReport";
import { type ReportBackTarget } from "../domain/tripReportIndex";

interface TripReportDetailPageProps {
  report: TripReport;
  backTarget: ReportBackTarget;
}

/**
 * Detail page for a single trip report.
 */
export const TripReportDetailPage = memo(function TripReportDetailPage({
  report,
  backTarget,
}: TripReportDetailPageProps) {
  return <TripReportDetailContent report={report} backTarget={backTarget} />;
});

const TripReportDetailContent = memo(function TripReportDetailContent({
  report,
  backTarget,
}: TripReportDetailPageProps) {
  const hasTimeline =
    report.onset.length > 0 || report.peak.length > 0 || report.offset.length > 0;

  const tocItems = [
    { id: "report-context", label: "Report Details", icon: "lucide:clipboard-list" as const },
    report.introduction
      ? { id: "report-introduction", label: "Introduction", icon: "lucide:book-open-text" as const }
      : null,
    report.onset.length > 0
      ? { id: "report-onset", label: "Onset", icon: "lucide:sunrise" as const }
      : null,
    report.peak.length > 0
      ? { id: "report-peak", label: "Peak", icon: "lucide:sun" as const }
      : null,
    report.offset.length > 0
      ? { id: "report-offset", label: "Offset", icon: "lucide:sunset" as const }
      : null,
    report.conclusion
      ? { id: "report-conclusion", label: "Conclusion / Aftermath", icon: "lucide:moon" as const }
      : null,
  ].filter(Boolean) as PublicTableOfContentsItem[];

  const tocNode =
    tocItems.length > 1 ? <PublicTableOfContents items={tocItems} variant="bare" /> : null;

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout toc={tocNode} contentClassName="gap-6">
        <BackButton backTarget={backTarget} />

        <ReportHeroSection report={report} />

        <div id="report-context" className="scroll-mt-24">
          <ReportDossier subject={report.subject} substances={report.substances} />
        </div>

        {/* Inline TOC for mobile/tablet; replaced by the sticky gutter TOC at >=1200px. */}
        {tocNode ? (
          <div className="min-[1200px]:hidden">
            <PublicTableOfContents items={tocItems} />
          </div>
        ) : null}

        {/* The narrative reads as one open article column capped at a
            comfortable measure; the timeline phases share a continuous rail. */}
        <article className="max-w-[70ch] space-y-10 pt-2">
          {report.introduction ? (
            <div id="report-introduction" className="scroll-mt-24">
              <TextSection title="Introduction" content={report.introduction} />
            </div>
          ) : null}

          {hasTimeline ? (
            <div className="theme-report-rail relative space-y-10 pl-8">
              {report.onset.length > 0 ? (
                <div id="report-onset" className="scroll-mt-24">
                  <TimelineSection phase="onset" entries={report.onset} />
                </div>
              ) : null}
              {report.peak.length > 0 ? (
                <div id="report-peak" className="scroll-mt-24">
                  <TimelineSection phase="peak" entries={report.peak} />
                </div>
              ) : null}
              {report.offset.length > 0 ? (
                <div id="report-offset" className="scroll-mt-24">
                  <TimelineSection phase="offset" entries={report.offset} />
                </div>
              ) : null}
            </div>
          ) : null}

          {report.conclusion ? (
            <div id="report-conclusion" className="scroll-mt-24">
              <TextSection title="Conclusion / Aftermath" content={report.conclusion} />
            </div>
          ) : null}
        </article>
      </StickyTocLayout>
    </main>
  );
});

function BackButton({
  backTarget,
}: {
  backTarget: ReportBackTarget;
}) {
  return (
    <Button variant="ghostPill" size="pill" asChild className="w-fit">
      <Link href={backTarget.href}>
        <Icon icon="lucide:arrow-left" size={16} />
        {backTarget.label}
      </Link>
    </Button>
  );
}
