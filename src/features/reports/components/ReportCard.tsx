import Link from "next/link";
import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import { interactiveSurfaceVariants, surfaceVariants } from "@/components/ui/surface";
import type { ReportCardModel } from "@/types/tripReport";
import { AuthorAvatar } from "./AuthorAvatar";
import { AuthorLink } from "./AuthorLink";

interface ReportCardProps {
  report: ReportCardModel;
  href?: string;
  onClick?: () => void;
}

/**
 * Card component for displaying a trip report in a list.
 */
export const ReportCard = memo(function ReportCard({ report, href, onClick }: ReportCardProps) {
  const { title, subject, substances, featured } = report;
  const disableNestedLinks = Boolean(href || onClick);

  const className = `${surfaceVariants({ variant: "public", padding: "md", radius: "xl" })} ${interactiveSurfaceVariants({ variant: "public" })} group relative flex w-full flex-col gap-4 text-left sm:flex-row sm:items-start sm:gap-5`;

  const content = (
    <>
      {featured && (
        <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200 sm:relative sm:right-auto sm:top-auto sm:ml-auto sm:self-start">
          <Icon icon="lucide:star" className="h-3.5 w-3.5 fill-amber-300/80 text-amber-300" />
          Featured
        </div>
      )}

      <div className="hidden shrink-0 overflow-hidden rounded-full ring-1 ring-[color:var(--theme-border-subtle)] sm:block">
        <AuthorAvatar
          authorName={subject.name}
          avatarUrl={subject.avatar_url}
          size={40}
          className="transition-transform duration-500 group-hover:scale-110"
        />
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="theme-text-primary text-base font-semibold tracking-tight transition-colors group-hover:text-[color:var(--theme-accent-soft)] sm:text-lg">
          {title}
        </h3>
        <div className="theme-text-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {subject.trip_date && (
            <span>on {subject.trip_date}</span>
          )}
          <span className="italic">
            — <AuthorLink authorName={subject.name} profileKey={subject.profile_key} className="theme-link-muted" disableLink={disableNestedLinks} />
          </span>
        </div>
      </div>

      <div className="relative grid gap-2 pt-4 sm:min-w-[220px] sm:pl-5 sm:pt-0 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent_0%,var(--theme-divider)_20%,var(--theme-divider)_80%,transparent_100%)] sm:before:left-0 sm:before:right-auto sm:before:top-0 sm:before:bottom-0 sm:before:h-auto sm:before:w-px sm:before:bg-[linear-gradient(180deg,transparent_0%,var(--theme-divider)_20%,var(--theme-divider)_80%,transparent_100%)]">
        {substances.map((substance, index) => (
          <div
            key={`${substance.name}-${index}`}
            className={surfaceVariants({ variant: "subtle", padding: "xs", radius: "lg" })}
          >
            <span className="theme-text-secondary text-sm font-medium tracking-wide">
              {substance.name}
            </span>
            {(substance.dose || substance.roa) && (
              <span className="theme-text-faint mt-1 block text-xs">
                {[substance.dose, substance.roa].filter(Boolean).join(" ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
});
