import Link from "next/link";
import { memo } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Button } from "@/components/ui/button";
import { publicHref } from "@/utils/publicHref";
import { ReportDossier } from "../components/ReportDossier";
import { TimelineSection } from "../components/TimelineSection";
import { TextSection } from "../components/TextSection";
import { ReportHeroSection } from "../components/ReportHeroSection";
import type { TripReport } from "@/types/tripReport";
import { type ReportBackTarget } from "../domain/tripReportIndex";

/** Section titles + icons defined once so the TOC, the section heading, and
 *  the heading icon never drift apart. */
const INTRODUCTION_SECTION = {
  title: "Introduction",
  icon: "lucide:book-open-text" as const,
} satisfies { title: string; icon: IconName };

const CONCLUSION_SECTION = {
  title: "Conclusion / Aftermath",
  icon: "lucide:moon" as const,
} satisfies { title: string; icon: IconName };

interface TripReportDetailPageProps {
  report: TripReport;
  backTarget: ReportBackTarget;
  /** Map of report substance name -> public article href, for substances that
   *  resolve to a known article. Built by the route loader in `page.tsx`. */
  substanceLinks?: Record<string, string>;
}

/**
 * Detail page for a single trip report.
 */
export const TripReportDetailPage = memo(function TripReportDetailPage({
  report,
  backTarget,
  substanceLinks,
}: TripReportDetailPageProps) {
  return (
    <TripReportDetailContent
      report={report}
      backTarget={backTarget}
      substanceLinks={substanceLinks}
    />
  );
});

const TripReportDetailContent = memo(function TripReportDetailContent({
  report,
  backTarget,
  substanceLinks,
}: TripReportDetailPageProps) {
  const hasTimeline =
    report.onset.length > 0 || report.peak.length > 0 || report.offset.length > 0;

  const tocItems = [
    { id: "report-context", label: "Report Details", icon: "lucide:clipboard-list" as const },
    report.introduction
      ? { id: "report-introduction", label: INTRODUCTION_SECTION.title, icon: INTRODUCTION_SECTION.icon }
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
      ? { id: "report-conclusion", label: CONCLUSION_SECTION.title, icon: CONCLUSION_SECTION.icon }
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
          <ReportDossier
            subject={report.subject}
            substances={report.substances}
            substanceLinks={substanceLinks}
          />
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
              <TextSection
                title={INTRODUCTION_SECTION.title}
                icon={INTRODUCTION_SECTION.icon}
                content={report.introduction}
              />
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
              <TextSection
                title={CONCLUSION_SECTION.title}
                icon={CONCLUSION_SECTION.icon}
                content={report.conclusion}
              />
            </div>
          ) : null}
        </article>

        <ReportFooterActions />
      </StickyTocLayout>
    </main>
  );
});

/**
 * Onward-path block at the foot of the narrative. The highest-intent moment on
 * the page: the reader just finished a report. Offers the page's single accent
 * CTA (share your own) plus quiet links back into the reports collection.
 */
function ReportFooterActions() {
  return (
    <footer className="theme-report-dossier mt-2 flex flex-col gap-4 rounded-2xl px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="theme-text-primary text-base font-semibold">Lived through something similar?</p>
        <p className="theme-text-muted text-sm">
          Share your own experience, or keep reading from the collection.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="accent" size="pill" asChild className="w-fit rounded-full">
          <Link href={publicHref.reportSubmission()}>
            <Icon icon="lucide:pencil-line" size={16} />
            Submit your report
          </Link>
        </Button>
        <Button variant="ghostPill" size="pill" asChild className="w-fit">
          <Link href={publicHref.reports()}>
            <Icon icon="lucide:library" size={16} />
            Browse more reports
          </Link>
        </Button>
      </div>
    </footer>
  );
}

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
