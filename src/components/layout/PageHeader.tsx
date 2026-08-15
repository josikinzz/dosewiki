import { memo, type ReactNode } from "react";
import { Icon as IconComponent, type IconName } from "../common/Icon";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  className?: string;
  title: string;
  description?: ReactNode;
  icon?: IconName;
  prominentMobileIcon?: boolean;
  showSpotlight?: boolean;
  descriptionClassName?: string;
  /** Extra classes merged onto the `h1`, e.g. a page that wants a smaller title. */
  titleClassName?: string;
  /**
   * Horizontal alignment of the whole header.
   *
   * Centred is right for a landing page whose header is the only thing above
   * the fold. It is wrong as soon as the page reads as an article: a centred
   * title above left-aligned prose has no shared edge with anything below it,
   * and next to a table-of-contents rail it drifts into the middle of the page
   * with nothing to anchor it. Those pages pass "left".
   */
  align?: "center" | "left";
}

export const PageHeader = memo(function PageHeader({
  className,
  title,
  description,
  icon,
  prominentMobileIcon = false,
  showSpotlight = true,
  descriptionClassName,
  titleClassName,
  align = "center",
}: PageHeaderProps) {
  const isLeft = align === "left";
  const iconClassName = cn(
    "theme-accent-heading shrink-0",
    prominentMobileIcon
      ? "h-[2.24em] w-[2.24em] sm:h-[1.12em] sm:w-[1.12em]"
      : undefined,
  );
  const titleClasses = cn(
    "type-page-title theme-accent-heading flex max-w-[22ch] items-center gap-x-4 break-words text-balance text-4xl sm:text-5xl md:text-6xl",
    isLeft ? "justify-start" : "mx-auto justify-center",
    prominentMobileIcon
      ? "flex-col gap-y-3 sm:flex-row sm:flex-wrap sm:gap-y-2"
      : "flex-wrap gap-y-2",
    titleClassName,
  );

  return (
    <header
      className={cn(
        "relative isolate mb-16 flex flex-col gap-5",
        isLeft ? "items-start text-left" : "text-center",
        className,
      )}
    >
      {showSpotlight ? (
        // The glow sits behind the title, so it follows it: centred under a
        // centred header, tucked behind the icon when the header is left-aligned.
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 -z-10 h-[320px] w-[320px] -translate-y-1/2 opacity-10",
            isLeft ? "left-0 -translate-x-1/4" : "left-1/2 -translate-x-1/2",
          )}
        >
          <div className="h-full w-full bg-[radial-gradient(closest-side,rgba(217,70,239,0.12)_0%,transparent_100%)] blur-[48px]" />
        </div>
      ) : null}

      <h1 className={titleClasses}>
        {icon ? <IconComponent icon={icon} size="1.12em" className={iconClassName} /> : null}
        <span className="min-w-0">{title}</span>
      </h1>
      {description ? (
        <div
          className={
            descriptionClassName ??
            cn(
              "type-lead type-reading-measure theme-accent-emphasis-scope theme-text-secondary text-balance",
              isLeft ? undefined : "mx-auto",
            )
          }
        >
          {description}
        </div>
      ) : null}
    </header>
  );
});
