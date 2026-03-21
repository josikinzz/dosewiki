import { memo, type ReactNode } from "react";
import { Icon as IconComponent, type IconName } from "../common/Icon";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: IconName;
}

export const PageHeader = memo(function PageHeader({ title, description, icon }: PageHeaderProps) {
  return (
    <header className="relative isolate mb-16 flex flex-col gap-4 text-center">
      {/* Aurora Background - Increased size and changed layering */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 opacity-14">
        <div className="h-full w-full bg-[radial-gradient(closest-side,rgba(217,70,239,0.14)_0%,transparent_100%)] blur-[40px]" />
      </div>

      <h1 className="font-display flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-balance break-words text-[2.5rem] font-bold tracking-tight text-fuchsia-300 sm:text-[3rem] drop-shadow-sm">
        {icon ? <IconComponent icon={icon} size={40} className="shrink-0 text-fuchsia-300" /> : null}
        <span className="min-w-0">{title}</span>
      </h1>
      {description && <div className="theme-text-secondary mx-auto max-w-2xl text-lg font-medium leading-relaxed">{description}</div>}
    </header>
  );
});
