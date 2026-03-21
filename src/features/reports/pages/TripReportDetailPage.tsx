import Link from "next/link";
import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { Button } from "@/components/ui/button";
import { SubjectInfoCard } from "../components/SubjectInfoCard";
import { SubstancesCard } from "../components/SubstancesCard";
import { TimelineSection } from "../components/TimelineSection";
import { TextSection } from "../components/TextSection";
import { ReportHeroSection } from "../components/ReportHeroSection";
import type { TripReport } from "@/types/tripReport";
import { slugify } from "@/utils/slug";

interface TripReportDetailPageProps {
  report: TripReport;
  substanceBySlug: Record<string, { name: string }>;
  fromSubstanceSlug?: string;
  backHref: string;
}

/**
 * Detail page for a single trip report.
 */
export const TripReportDetailPage = memo(function TripReportDetailPage({
  report,
  substanceBySlug,
  fromSubstanceSlug,
  backHref,
}: TripReportDetailPageProps) {
  return <TripReportDetailContent report={report} substanceBySlug={substanceBySlug} fromSubstanceSlug={fromSubstanceSlug} backHref={backHref} />;
});

const TripReportDetailContent = memo(function TripReportDetailContent({
  report,
  substanceBySlug,
  fromSubstanceSlug,
  backHref,
}: TripReportDetailPageProps) {
  const tocItems = [
    { id: "report-context", label: "Context", icon: "lucide:user" as const },
    { id: "report-substances", label: "Substances", icon: "lucide:pill" as const, tone: "accent" as const },
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

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-8">
        <BackButton
          href={backHref}
          fromSubstanceSlug={fromSubstanceSlug}
          report={report}
          substanceBySlug={new Map(Object.entries(substanceBySlug))}
        />

        <ReportHeroSection report={report} />

        <PublicTableOfContents items={tocItems} />

        <div className="grid gap-6 md:grid-cols-2">
          <div id="report-context">
            <SubjectInfoCard subject={report.subject} delay={0.05} />
          </div>
          <div id="report-substances">
            <SubstancesCard substances={report.substances} delay={0.1} />
          </div>
        </div>

        {report.introduction ? (
          <div id="report-introduction">
            <TextSection title="Introduction" content={report.introduction} delay={0.15} />
          </div>
        ) : null}

        <div className="space-y-6">
          {report.onset.length > 0 ? (
            <div id="report-onset">
              <TimelineSection phase="onset" entries={report.onset} delay={0.2} />
            </div>
          ) : null}
          {report.peak.length > 0 ? (
            <div id="report-peak">
              <TimelineSection phase="peak" entries={report.peak} delay={0.25} />
            </div>
          ) : null}
          {report.offset.length > 0 ? (
            <div id="report-offset">
              <TimelineSection phase="offset" entries={report.offset} delay={0.3} />
            </div>
          ) : null}
        </div>

        {report.conclusion ? (
          <div id="report-conclusion">
            <TextSection title="Conclusion / Aftermath" content={report.conclusion} delay={0.35} />
          </div>
        ) : null}
      </div>
    </main>
  );
});

function BackButton({
  href,
  fromSubstanceSlug,
  report,
  substanceBySlug,
}: {
  href: string;
  fromSubstanceSlug?: string;
  report: TripReport | null | undefined;
  substanceBySlug: Map<string, { name: string }>;
}) {
  let backToSubstance: string | null = null;

  if (fromSubstanceSlug) {
    const substance = substanceBySlug.get(fromSubstanceSlug);
    if (substance) {
      backToSubstance = substance.name;
    }
  }

  if (!backToSubstance && report && report.substances.length > 0) {
    for (const reportSubstance of report.substances) {
      const substanceName = reportSubstance.name.trim().toLowerCase();
      const slug = slugify(reportSubstance.name);
      const bySlug = substanceBySlug.get(slug);
      if (bySlug) {
        backToSubstance = bySlug.name;
        break;
      }

      for (const [, substanceRecord] of substanceBySlug.entries()) {
        const title = substanceRecord.name.toLowerCase();
        if (title === substanceName) {
          backToSubstance = substanceRecord.name;
          break;
        }
      }

      if (backToSubstance) {
        break;
      }
    }
  }

  const buttonText = backToSubstance ? `Back to ${backToSubstance}` : "Back to Reports";

  return (
    <Button variant="ghostPill" size="pill" asChild className="w-fit">
      <Link href={href}>
        <Icon icon="lucide:arrow-left" size={16} />
        {buttonText}
      </Link>
    </Button>
  );
}
