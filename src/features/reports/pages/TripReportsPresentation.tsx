"use client";

import { Icon } from "@/components/common/Icon";
import { IndexCard } from "@/components/common/IndexCard";
import { SmartLink } from "@/components/common/SmartLink";
import { useT, useUiLocale } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { ReportCardModel } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { formatTripDateLabel } from "@/utils/tripReportDate";
import { COMPACT_TRIP_REPORT_CARD_CLASS } from "../components/TripReportCard";
import type { TripReportGroup } from "../domain/tripReportIndex";

export function SubmitReportTile() {
  const t = useT();
  return (
    <SmartLink
      href={publicHref.reportSubmission()}
      className={cn(COMPACT_TRIP_REPORT_CARD_CLASS, "min-h-[4.25rem] flex-col items-start justify-center gap-1")}
    >
      <span className="theme-accent-heading flex items-center gap-1.5 text-sm font-medium transition group-hover:opacity-90">
        <Icon icon="lucide:file-pen-line" size={14} aria-hidden />
        {t("Submit a report")}
      </span>
      <span className="theme-text-faint text-xs leading-snug">
        {t("Stays private until an editor approves it.")}
      </span>
    </SmartLink>
  );
}

export function ReportShelf({
  group,
  reportHref,
  expanded,
  onExpandedChange,
}: {
  group: TripReportGroup<ReportCardModel>;
  reportHref: (slug: string) => string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const t = useT();
  const authorProfileKey = group.kind === "author" ? group.reports[0]?.subject.profile_key : undefined;
  return (
    <div id={group.anchor} className="scroll-mt-[calc(var(--site-header-height)+var(--site-header-sticky-gap)+3.75rem)]">
      <IndexCard
        title={t(group.name)}
        icon="lucide:flask-conical"
        hideIcon
        count={group.reportCount ?? group.reports.length}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        contentId={`shelf-${group.anchor}`}
        titleHref={authorProfileKey ? publicHref.contributor(authorProfileKey) : undefined}
      >
        <ul>
          {group.reports.map((report) => (
            <ReportIndexRow key={report.slug} report={report} href={reportHref(report.slug)} groupKind={group.kind} />
          ))}
        </ul>
      </IndexCard>
    </div>
  );
}

function ReportIndexRow({
  href,
  report,
  groupKind,
}: {
  href: string;
  report: ReportCardModel;
  groupKind: TripReportGroup<ReportCardModel>["kind"];
}) {
  const t = useT();
  const locale = useUiLocale();
  const primary = report.substances[0];
  const substanceLabel =
    groupKind === "substance"
      ? primary?.dose?.trim()
      : report.substances.length === 1
        ? [primary?.name, primary?.dose?.trim()].filter(Boolean).join(" ")
        : report.substances.map((substance) => substance.name).join(" + ");
  const metaParts = [
    substanceLabel,
    formatTripDateLabel(report.subject.trip_date, locale),
    groupKind === "author" ? null : report.subject.name,
  ].filter((part): part is string => Boolean(part));

  return (
    <li className="theme-report-index-row" data-report-slug={report.slug}>
      <SmartLink href={href} className="theme-report-index-link group flex min-h-11 flex-col gap-0.5 rounded-lg px-2.5 py-2 transition-[background-color,scale] duration-160 active:scale-[0.995] motion-reduce:transition-none motion-reduce:active:scale-100">
        <span className="flex items-start gap-1.5">
          <span className="theme-accent-heading text-sm font-medium leading-snug transition group-hover:opacity-90">
            {report.title}
          </span>
          {report.featured ? (
            <Icon icon="lucide:star" size={13} className="theme-icon-accent mt-0.5 shrink-0 fill-current" aria-label={t("Featured report")} />
          ) : null}
        </span>
        {metaParts.length > 0 ? (
          <span className="theme-report-metadata-text text-xs leading-snug">{metaParts.join(" · ")}</span>
        ) : null}
      </SmartLink>
    </li>
  );
}
