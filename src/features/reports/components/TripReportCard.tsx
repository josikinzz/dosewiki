import { SmartLink } from "@/components/common/SmartLink";
import { memo, type ReactNode } from "react";
import { useT, useUiLocale } from "@/i18n/client";
import { Icon } from "@/components/common/Icon";
import { PublicPill } from "@/components/common/PublicTokens";
import {
  interactiveSurfaceVariants,
  surfaceVariants,
} from "@/components/ui/surface";
import type {
  ReportCardModel,
  TripReport,
  TripReportSubstance,
} from "@/types/tripReport";
import { cn } from "@/lib/utils";
import { formatTripDateLabel } from "@/utils/tripReportDate";
import { AuthorAvatar } from "./AuthorAvatar";
import { AuthorLink } from "./AuthorLink";

export type TripReportCardDensity = "full" | "compact";
export type TripReportCardSurfaceTone = "default" | "dense";

export type TripReportCardProjection = {
  authorAvatarUrl?: string;
  authorName: string;
  authorProfileKey?: string;
  featured: boolean;
  slug: string;
  substances: TripReportSubstance[];
  title: string;
  tripDate?: string;
};

type TripReportCardSource = ReportCardModel | TripReport | TripReportCardProjection;

export function projectTripReportCard(
  report: TripReportCardSource,
): TripReportCardProjection {
  if ("authorName" in report) {
    return report;
  }

  return {
    authorAvatarUrl: report.subject.avatar_url,
    authorName: report.subject.name,
    authorProfileKey: report.subject.profile_key,
    featured: report.featured === true,
    slug: report.slug,
    substances: report.substances,
    title: report.title,
    tripDate: report.subject.trip_date,
  };
}

export interface TripReportCardProps {
  className?: string;
  density?: TripReportCardDensity;
  href?: string;
  onClick?: () => void;
  report: TripReportCardSource;
  showFeatured?: boolean;
  showSubstances?: boolean;
  surfaceTone?: TripReportCardSurfaceTone;
}

export const TripReportCard = memo(function TripReportCard({
  className,
  density = "full",
  href,
  onClick,
  report,
  showFeatured = true,
  showSubstances = true,
  surfaceTone = "default",
}: TripReportCardProps) {
  const projected = projectTripReportCard(report);
  const disableNestedLinks = Boolean(href || onClick);
  const content =
    density === "compact" ? (
      <CompactTripReportCardContent
        report={projected}
        disableNestedLinks={disableNestedLinks}
        showFeatured={showFeatured}
      />
    ) : (
      <FullTripReportCardContent
        report={projected}
        disableNestedLinks={disableNestedLinks}
        showFeatured={showFeatured}
        showSubstances={showSubstances}
        surfaceTone={surfaceTone}
      />
    );
  const cardClassName = cn(
    getTripReportCardClassName(density, surfaceTone),
    disableNestedLinks && "transition-[scale,border-color,background-color,box-shadow,color] duration-160 active:scale-[0.995] motion-reduce:transition-none motion-reduce:active:scale-100",
    className,
  );

  if (href) {
    return (
      <SmartLink href={href} className={cardClassName}>
        {content}
      </SmartLink>
    );
  }

  if (!onClick) {
    return <article className={cardClassName}>{content}</article>;
  }

  return (
    <button type="button" onClick={onClick} className={cardClassName}>
      {content}
    </button>
  );
});

/**
 * The compact card's surface, exported because the band's contribution tile
 * is a cell of the same grid and must be the same object rather than a
 * lookalike that drifts from it.
 */
export const COMPACT_TRIP_REPORT_CARD_CLASS = cn(
  surfaceVariants({ variant: "subtle", padding: "xs", radius: "lg" }),
  interactiveSurfaceVariants({ variant: "quiet" }),
  "group flex w-full items-center gap-3 text-left",
);

function getTripReportCardClassName(
  density: TripReportCardDensity,
  surfaceTone: TripReportCardSurfaceTone,
) {
  if (density === "compact") {
    return COMPACT_TRIP_REPORT_CARD_CLASS;
  }

  if (surfaceTone === "dense") {
    return cn(
      surfaceVariants({ variant: "subtle", padding: "md", radius: "lg" }),
      interactiveSurfaceVariants({ variant: "public" }),
      "group relative flex w-full flex-col gap-3 text-left sm:flex-row sm:items-start sm:gap-4",
    );
  }

  return cn(
    surfaceVariants({ variant: "public", padding: "md", radius: "xl" }),
    interactiveSurfaceVariants({ variant: "public" }),
    "group relative flex w-full flex-col gap-4 text-left sm:flex-row sm:items-start sm:gap-5",
  );
}

function FullTripReportCardContent({
  disableNestedLinks,
  report,
  showFeatured,
  showSubstances,
  surfaceTone,
}: {
  disableNestedLinks: boolean;
  report: TripReportCardProjection;
  showFeatured: boolean;
  showSubstances: boolean;
  surfaceTone: TripReportCardSurfaceTone;
}) {
  return (
    <>
      {showFeatured && report.featured ? <FeaturedReportBadge /> : null}

      <div className="hidden shrink-0 overflow-hidden rounded-full ring-1 ring-[color:color-mix(in_srgb,var(--theme-accent)_15%,transparent)] sm:block">
        <AuthorAvatar
          authorName={report.authorName}
          avatarUrl={report.authorAvatarUrl}
          size={40}
        />
      </div>

      <TripReportCardTitleBlock
        report={report}
        disableNestedLinks={disableNestedLinks}
      />

      {showSubstances ? (
        <TripReportSubstanceList
          substances={report.substances}
          surfaceTone={surfaceTone}
        />
      ) : null}
    </>
  );
}

function CompactTripReportCardContent({
  disableNestedLinks,
  report,
  showFeatured,
}: {
  disableNestedLinks: boolean;
  report: TripReportCardProjection;
  showFeatured: boolean;
}) {
  return (
    <>
      <div className="shrink-0 self-center">
        <AuthorAvatar
          authorName={report.authorName}
          avatarUrl={report.authorAvatarUrl}
          size={32}
        />
      </div>

      <TripReportCardTitleBlock
        report={report}
        disableNestedLinks={disableNestedLinks}
        compact
      />

      {showFeatured && report.featured ? (
        <Icon
          icon="lucide:star"
          size={20}
          className="theme-icon-accent flex-shrink-0 self-center fill-current"
        />
      ) : null}
    </>
  );
}

function TripReportCardTitleBlock({
  compact = false,
  disableNestedLinks,
  report,
}: {
  compact?: boolean;
  disableNestedLinks: boolean;
  report: TripReportCardProjection;
}) {
  const t = useT();
  const locale = useUiLocale();
  const dateLabel = formatTripDateLabel(report.tripDate, locale);
  const byLabel = t("by");

  return (
    <div className="min-w-0 flex-1">
      <h3
        className={cn(
          compact
            ? "theme-accent-heading text-sm font-medium transition group-hover:opacity-90"
            : "theme-text-primary text-base font-semibold tracking-tight transition group-hover:opacity-90 sm:text-lg",
        )}
      >
        {report.title}
      </h3>
      <div
        className={cn(
          compact
            ? "theme-report-metadata-text mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            : "theme-report-metadata-text mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm",
        )}
      >
        {dateLabel ? (
          compact ? (
            <span className="flex items-center gap-1">
              <Icon icon="lucide:calendar" size={12} />
              {dateLabel}
            </span>
          ) : (
            <span>{dateLabel}</span>
          )
        ) : null}
        <span className={compact ? "flex items-center gap-1" : "flex items-center gap-1 italic"}>
          {compact ? <Icon icon="lucide:user" size={12} /> : <span>{byLabel}</span>}
          <AuthorLink
            authorName={report.authorName}
            profileKey={report.authorProfileKey}
            className="theme-report-author-link"
            disableLink={disableNestedLinks}
          />
        </span>
      </div>
    </div>
  );
}

function TripReportSubstanceList({
  surfaceTone,
  substances,
}: {
  surfaceTone: TripReportCardSurfaceTone;
  substances: TripReportSubstance[];
}) {
  const isDense = surfaceTone === "dense";

  return (
    <div
      className={cn(
        "relative grid pt-4 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[image:var(--theme-horizontal-divider-image)] sm:min-w-[220px] sm:pl-5 sm:pt-0 sm:before:bottom-0 sm:before:left-0 sm:before:right-auto sm:before:top-0 sm:before:h-auto sm:before:w-px",
        isDense
          ? "gap-1.5 sm:before:bg-dose-divider"
          : "gap-2 sm:before:bg-gradient-to-b sm:before:from-transparent sm:before:via-[color:color-mix(in_srgb,var(--theme-accent)_20%,transparent)] sm:before:to-transparent",
      )}
    >
      {substances.map((substance, index) => (
        <div
          key={`${substance.name}-${index}`}
          className={
            isDense
              ? "px-0 py-0.5"
              : "theme-name-chip rounded-xl p-3 ring-1"
          }
        >
          <span className="theme-report-substance-text text-sm font-medium tracking-wide">
            {substance.name}
          </span>
          {(substance.dose || substance.roa) ? (
            <span className="theme-text-faint mt-1 block text-xs">
              {[substance.dose, substance.roa].filter(Boolean).join(" ")}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FeaturedReportBadge(): ReactNode {
  return (
    <PublicPill
      icon="lucide:star"
      tone="warning"
      size="sm"
      className="theme-report-featured-text absolute right-4 top-4 sm:relative sm:right-auto sm:top-auto sm:ml-auto sm:self-start"
    >
      Featured
    </PublicPill>
  );
}
