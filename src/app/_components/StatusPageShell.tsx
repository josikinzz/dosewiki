"use client";

import type { ReactNode } from "react";
import type { IconName } from "@/components/common/Icon";
import {
  StatusActions,
  StatusFact,
  StatusHeader,
} from "@/components/layout/PublicFeedbackPrimitives";
import type { BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusPageShellProps = {
  badge: string;
  badgeVariant?: BadgeProps["variant"];
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  complement?: ReactNode;
  /** Optional overline rendered above the complement facts (e.g. "Access details").
   *  Centralizes the eyebrow that every status page previously hand-wrote. */
  complementHeading?: ReactNode;
  statusIcon?: IconName;
  statusTone?: "accent" | "success" | "warning" | "danger" | "neutral";
  className?: string;
  minHeightClassName?: string;
};

export { StatusActions, StatusFact, StatusHeader };

export function StatusPageShell({
  badge,
  badgeVariant = "default",
  title,
  description,
  actions,
  children,
  complement,
  complementHeading,
  statusIcon,
  statusTone = "accent",
  className,
  minHeightClassName,
}: StatusPageShellProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        "mx-auto flex w-full max-w-2xl items-center px-4 py-16 focus:outline-none",
        minHeightClassName ?? "min-h-[calc(100vh-12rem)]",
        className,
      )}
    >
      <div className="relative w-full space-y-8">
        <StatusHeader
          badge={badge}
          badgeVariant={badgeVariant}
          title={title}
          description={description}
          statusIcon={statusIcon}
          statusTone={statusTone}
        />

        {actions ? <StatusActions>{actions}</StatusActions> : null}

        {children ? <div className="space-y-6">{children}</div> : null}

        {complement ? (
          <div className="space-y-4">
            <span aria-hidden="true" className="theme-horizontal-divider block" />
            {complementHeading ? (
              <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">
                {complementHeading}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">{complement}</div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
