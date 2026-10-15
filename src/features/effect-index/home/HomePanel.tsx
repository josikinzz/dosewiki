import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

const PANEL_BAND_CLASS = "bg-dose-surface-muted";

interface HomePanelProps {
  title: string;
  description?: string;
  icon: IconName;
  stub?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function HomePanel({
  title,
  description,
  icon,
  stub,
  children,
  className,
  contentClassName,
}: HomePanelProps) {
  return (
    <section
      className={cn(
        "theme-public-card flex flex-col overflow-hidden rounded-xl border",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-4 border-b border-dose-border px-3 py-2",
          PANEL_BAND_CLASS,
        )}
      >
        <div className="min-w-0">
          <h2 className="theme-text-primary text-xl font-normal leading-tight">{title}</h2>
          {description ? (
            <p className="theme-text-muted mt-0.5 text-[0.8125rem] italic leading-snug">
              {description}
            </p>
          ) : null}
        </div>
        <Icon icon={icon} size={26} className="theme-text-faint mt-0.5 shrink-0" />
      </div>

      <div className={contentClassName ?? "px-3 py-3"}>{children}</div>

      {stub ? (
        <div
          className={cn(
            "theme-text-muted border-t border-dose-border px-3 py-1.5 text-[0.9375rem]",
            PANEL_BAND_CLASS,
          )}
        >
          {stub}
        </div>
      ) : null}
    </section>
  );
}

export function HomePanelGroupLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[0.8125rem] font-normal uppercase leading-none tracking-[0.16em] text-dose-accent">
      {children}
    </h3>
  );
}

export const homePanelLinkClassName =
  "text-dose-accent transition-colors hover:text-dose-accent-strong hover:underline hover:decoration-1 hover:underline-offset-2 theme-focus-ring";

export const homePanelRowClassName =
  "border-b border-dose-border px-3 py-3 last:border-b-0 transition-colors hover:bg-dose-surface-muted";
