"use client";

import type { ReactNode } from "react";
import type { IconName } from "@/components/common/Icon";
import {
  StatusActions,
  StatusFact,
  StatusHeader,
} from "@/components/layout/PublicFeedbackPrimitives";
import type { BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatusPageShellProps = {
  badge: string;
  badgeVariant?: BadgeProps["variant"];
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  complement?: ReactNode;
  /** Optional overline rendered above the complement aside (e.g. "Quick links").
   *  Centralizes the eyebrow that every status page previously hand-wrote. */
  complementHeading?: ReactNode;
  /** Visual treatment for the complement aside. "boxed" (default) renders the
   *  frosted bordered panel; "plain" renders heading + flowed content with no
   *  border/frosted box/shadow for a flat side rail of links. */
  complementVariant?: "boxed" | "plain";
  statusIcon?: IconName;
  statusTone?: "accent" | "success" | "warning" | "danger" | "neutral";
  statusLoading?: boolean;
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
  complementVariant = "boxed",
  statusIcon,
  statusTone = "accent",
  statusLoading = false,
  className,
  minHeightClassName,
}: StatusPageShellProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        "mx-auto flex w-full max-w-5xl items-center px-4 py-16 focus:outline-none",
        minHeightClassName ?? "min-h-[calc(100vh-12rem)]",
        className,
      )}
    >
      <div className="relative w-full">
        <div
          aria-hidden="true"
          className="theme-section-header-glow pointer-events-none absolute inset-x-12 top-2 -z-10 h-40 rounded-full opacity-80 blur-3xl"
        />

        <Card className="theme-state-card relative overflow-hidden rounded-[2rem] p-0 shadow-2xl">
          <div
            className={cn(
              "relative grid gap-8 p-8 sm:p-10",
              complement ? "lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start" : undefined,
            )}
          >
            <div className="space-y-6">
              <StatusHeader
                badge={badge}
                badgeVariant={badgeVariant}
                title={title}
                description={description}
                statusIcon={statusIcon}
                statusTone={statusTone}
                statusLoading={statusLoading}
              />

              {actions ? <StatusActions>{actions}</StatusActions> : null}

              {children ? <div className="space-y-4">{children}</div> : null}
            </div>

            {complement ? (
              <aside
                className={cn(
                  "relative flex h-fit flex-col gap-4",
                  complementVariant === "plain"
                    ? "lg:pl-2"
                    : "theme-overlay-surface rounded-[1.5rem] border p-5 backdrop-blur",
                )}
              >
                {complementHeading ? (
                  <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">
                    {complementHeading}
                  </p>
                ) : null}
                {complement}
              </aside>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
