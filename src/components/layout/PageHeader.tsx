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
}

export const PageHeader = memo(function PageHeader({
  className,
  title,
  description,
  icon,
  prominentMobileIcon = false,
  showSpotlight = true,
  descriptionClassName,
}: PageHeaderProps) {
  const iconClassName = cn(
    "theme-accent-heading shrink-0",
    prominentMobileIcon
      ? "h-[2.24em] w-[2.24em] sm:h-[1.12em] sm:w-[1.12em]"
      : undefined,
  );
  const titleClassName = cn(
    "type-page-title theme-accent-heading mx-auto flex max-w-[22ch] items-center justify-center gap-x-4 break-words text-balance text-4xl sm:text-5xl md:text-6xl",
    prominentMobileIcon
      ? "flex-col gap-y-3 sm:flex-row sm:flex-wrap sm:gap-y-2"
      : "flex-wrap gap-y-2",
  );

  return (
    <header className={cn("relative isolate mb-16 flex flex-col gap-5 text-center", className)}>
      {showSpotlight ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 opacity-10">
          <div className="h-full w-full bg-[radial-gradient(closest-side,rgba(217,70,239,0.12)_0%,transparent_100%)] blur-[48px]" />
        </div>
      ) : null}

      <h1 className={titleClassName}>
        {icon ? <IconComponent icon={icon} size="1.12em" className={iconClassName} /> : null}
        <span className="min-w-0">{title}</span>
      </h1>
      {description ? (
        <div className={descriptionClassName ?? "type-lead type-reading-measure theme-accent-emphasis-scope theme-text-secondary mx-auto text-balance"}>
          {description}
        </div>
      ) : null}
    </header>
  );
});
