import Link from "next/link";
import { memo, type ReactNode } from "react";
import { msg, type Translate } from "@/i18n/messages";
import { Icon, type IconName } from "@/components/common/Icon";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Button } from "@/components/ui/button";
import { publicHref } from "@/utils/publicHref";
import { ReportDossier } from "../components/ReportDossier";
import { TimelineSection } from "../components/TimelineSection";
import { TextSection } from "../components/TextSection";
import { ReportHeroSection } from "../components/ReportHeroSection";
import type { TripReport } from "@/types/tripReport";
import { ReportBackLink } from "../components/ReportBackLink";
import { type SubstanceLookupRecord } from "../domain/tripReportIndex";

const INTRODUCTION_SECTION = {
  title: "Introduction",
  icon: "lucide:book-open-text" as const,
} satisfies { title: string; icon: IconName };

const CONCLUSION_SECTION = {
  title: msg("Conclusion / Aftermath"),
  icon: "lucide:moon" as const,
} satisfies { title: string; icon: IconName };

export interface TripReportDetailPageProps {
  report: TripReport;
  substanceBySlug: Record<string, SubstanceLookupRecord>;
  substanceLinks?: Record<string, string>;
  preview?: boolean;
  t: Translate;
  editor?: ReactNode;
}

export const TripReportDetailPresentation = memo(function TripReportDetailPresentation({
  report,
  substanceBySlug,
  substanceLinks,
  preview,
  t,
  editor,
}: TripReportDetailPageProps) {
  const hasTimeline =
    report.onset.length > 0 || report.peak.length > 0 || report.offset.length > 0;

  const tocItems = [
    { id: "report-context", label: t("Report Details"), icon: "lucide:clipboard-list" as const },
    report.introduction
      ? { id: "report-introduction", label: t(INTRODUCTION_SECTION.title), icon: INTRODUCTION_SECTION.icon }
      : null,
    report.onset.length > 0
      ? { id: "report-onset", label: t("Onset"), icon: "lucide:sunrise" as const }
      : null,
    report.peak.length > 0
      ? { id: "report-peak", label: t("Peak"), icon: "lucide:sun" as const }
      : null,
    report.offset.length > 0
      ? { id: "report-offset", label: t("Offset"), icon: "lucide:sunset" as const }
      : null,
    report.conclusion
      ? { id: "report-conclusion", label: t(CONCLUSION_SECTION.title), icon: CONCLUSION_SECTION.icon }
      : null,
  ].filter(Boolean) as PublicTableOfContentsItem[];

  const tocNode =
    !preview && tocItems.length > 1 ? <PublicTableOfContents items={tocItems} variant="bare" /> : null;

  return (
    <main id={preview ? undefined : "main-content"} tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout toc={tocNode} contentClassName="gap-6" className="theme-toc-strip-scope">
        {tocNode ? <PublicTocStrip items={tocItems} /> : null}

        {!preview ? <ReportBackLink substances={report.substances} substanceBySlug={substanceBySlug} /> : null}
        {editor}

        <ReportHeroSection
          title={report.title}
          featured={report.featured}
          tags={report.tags}
          license={report.license}
          subject={{
            name: report.subject.name,
            avatar_url: report.subject.avatar_url,
            profile_key: report.subject.profile_key,
            trip_date: report.subject.trip_date,
          }}
        />

        <div id={preview ? undefined : "report-context"} className="scroll-mt-24">
          <ReportDossier
            subject={report.subject}
            substances={report.substances}
            substanceLinks={substanceLinks}
            t={t}
          />
        </div>

        <article className="max-w-[70ch] space-y-10 pt-2">
          {report.introduction ? (
            <div id={preview ? undefined : "report-introduction"} className="scroll-mt-24">
              <TextSection
                title={t(INTRODUCTION_SECTION.title)}
                icon={INTRODUCTION_SECTION.icon}
                content={report.introduction}
              />
            </div>
          ) : null}

          {hasTimeline ? (
            <div className="theme-report-rail relative space-y-10 pl-8">
              {report.onset.length > 0 ? (
                <TimelineSection id={preview ? undefined : "report-onset"} phase="onset" entries={report.onset} t={t} />
              ) : null}
              {report.peak.length > 0 ? (
                <TimelineSection id={preview ? undefined : "report-peak"} phase="peak" entries={report.peak} t={t} />
              ) : null}
              {report.offset.length > 0 ? (
                <TimelineSection id={preview ? undefined : "report-offset"} phase="offset" entries={report.offset} t={t} />
              ) : null}
            </div>
          ) : null}

          {report.conclusion ? (
            <div id={preview ? undefined : "report-conclusion"} className="scroll-mt-24">
              <TextSection
                title={t(CONCLUSION_SECTION.title)}
                icon={CONCLUSION_SECTION.icon}
                content={report.conclusion}
              />
            </div>
          ) : null}
        </article>

        {!preview ? <ReportFooterActions t={t} /> : null}
      </StickyTocLayout>
    </main>
  );
});

function ReportFooterActions({ t }: { t: Translate }) {
  return (
    <footer className="theme-report-dossier mt-2 flex flex-col gap-4 rounded-2xl px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="theme-text-primary text-base font-semibold">{t("Lived through something similar?")}</p>
        <p className="theme-text-muted text-sm">
          {t("Share your own experience, or keep reading from the collection.")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="accent" size="pill" asChild className="w-fit rounded-full">
          <Link href={publicHref.reportSubmission()}>
            <Icon icon="lucide:pencil-line" size={16} />
            {t("Submit your report")}
          </Link>
        </Button>
        <Button variant="ghostPill" size="pill" asChild className="w-fit">
          <Link href={publicHref.reports()}>
            <Icon icon="lucide:library" size={16} />
            {t("Browse more reports")}
          </Link>
        </Button>
      </div>
    </footer>
  );
}
