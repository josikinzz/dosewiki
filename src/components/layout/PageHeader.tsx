import { memo, type ReactNode } from "react";
import { Icon as IconComponent, type IconName } from "../common/Icon";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: IconName;
  showSpotlight?: boolean;
  descriptionClassName?: string;
}

export const PageHeader = memo(function PageHeader({
  title,
  description,
  icon,
  showSpotlight = true,
  descriptionClassName,
}: PageHeaderProps) {
  return (
    <header className="relative isolate mb-16 flex flex-col gap-5 text-center">
      {showSpotlight ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 opacity-10">
          <div className="h-full w-full bg-[radial-gradient(closest-side,rgba(217,70,239,0.12)_0%,transparent_100%)] blur-[48px]" />
        </div>
      ) : null}

      <h1 className="type-page-title theme-accent-heading mx-auto flex max-w-[22ch] flex-wrap items-center justify-center gap-x-4 gap-y-2 break-words text-balance text-4xl sm:text-5xl md:text-6xl">
        {icon ? <IconComponent icon={icon} size="1.12em" className="theme-accent-heading shrink-0" /> : null}
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
