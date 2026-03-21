"use client";

import type { ReactNode } from "react";
import { StatusOrb } from "@/components/common/StatusOrb";
import type { IconName } from "@/components/common/Icon";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatusPageShellProps = {
  badge: string;
  badgeVariant?: BadgeProps["variant"];
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  complement?: ReactNode;
  statusIcon?: IconName;
  statusTone?: "accent" | "success" | "warning" | "danger" | "neutral";
  statusLoading?: boolean;
  className?: string;
  minHeightClassName?: string;
};

type StatusFactProps = {
  label: string;
  value: ReactNode;
};

export function StatusPageShell({
  badge,
  badgeVariant = "default",
  title,
  description,
  actions,
  children,
  complement,
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
          className="pointer-events-none absolute inset-x-12 top-2 -z-10 h-40 rounded-full opacity-80 blur-3xl [background:radial-gradient(circle_at_center,color-mix(in_srgb,var(--theme-accent)_24%,transparent)_0%,transparent_72%)]"
        />

        <Card className="relative overflow-hidden rounded-[2rem] p-0 shadow-[0_28px_72px_-36px_var(--theme-shadow-strong)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background:linear-gradient(135deg,color-mix(in_srgb,var(--theme-accent)_10%,transparent),transparent_40%,color-mix(in_srgb,var(--theme-accent-soft)_12%,transparent))]"
          />

          <div
            className={cn(
              "relative grid gap-8 p-8 sm:p-10",
              complement ? "lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start" : undefined,
            )}
          >
            <div className="space-y-6">
              <CardHeader className="space-y-4 p-0">
                <Badge variant={badgeVariant} className="w-fit">
                  {badge}
                </Badge>

                <div className="space-y-4">
                  {statusIcon ? (
                    <StatusOrb icon={statusIcon} tone={statusTone} loading={statusLoading} size="md" />
                  ) : null}
                  <CardTitle className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                    {title}
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-base leading-7 theme-text-secondary">
                    {description}
                  </CardDescription>
                </div>
              </CardHeader>

              {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}

              {children ? <div className="space-y-4">{children}</div> : null}
            </div>

            {complement ? (
              <aside className="theme-overlay-surface relative flex h-fit flex-col gap-4 rounded-[1.5rem] border p-5 backdrop-blur">
                {complement}
              </aside>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}

export function StatusFact({ label, value }: StatusFactProps) {
  return (
    <div className="rounded-2xl border border-[color:var(--theme-border-subtle)] bg-[color:color-mix(in_srgb,var(--theme-surface-muted)_76%,transparent)] p-4">
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">{label}</p>
      <div className="mt-2 text-sm leading-6 theme-text-secondary">{value}</div>
    </div>
  );
}
