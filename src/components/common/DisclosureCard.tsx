import type { ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

// Native-<details> disclosure card: a summary "pill" inside a rounded card
// frame, no client JS. The card keeps a tight p-2 frame so the summary reads
// as a pill; the body then re-indents (px-3 pb-3) so expanded content lands
// 20px from every card edge — flush with the summary label and equal to
// ContentCard padding="md" — instead of hugging the frame.
const DETAILS_BASE_CLASS =
  "group/disclosure rounded-2xl border p-2 transition-colors";

const DETAILS_VARIANT_CLASS = {
  card: "theme-card-surface border-dose-border open:border-dose-card-border-strong open:bg-dose-surface-muted/30",
  subtle:
    "theme-public-card-subtle hover:border-dose-card-border open:border-dose-card-border",
} as const;

const SUMMARY_CLASS =
  "theme-accent-heading flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-dose-surface-muted/60 theme-focus-ring group-open/disclosure:bg-dose-surface-muted/45 [&::marker]:content-[''] [&::-webkit-details-marker]:hidden";

const CHEVRON_CLASS =
  "theme-icon-muted h-4 w-4 shrink-0 transition-transform duration-200 group-open/disclosure:rotate-180 group-open/disclosure:text-dose-accent-strong";

const BODY_CLASS = "px-3 pb-3 pt-3";

export type DisclosureCardProps = {
  summary: ReactNode;
  children: ReactNode;
  /** Initial open state of the native <details>; the browser owns it afterward. */
  defaultOpen?: boolean;
  id?: string;
  variant?: keyof typeof DETAILS_VARIANT_CLASS;
  className?: string;
  summaryClassName?: string;
  bodyClassName?: string;
};

export function DisclosureCard({
  summary,
  children,
  defaultOpen = false,
  id,
  variant = "card",
  className,
  summaryClassName,
  bodyClassName,
}: DisclosureCardProps) {
  return (
    <details
      id={id}
      open={defaultOpen || undefined}
      className={cn(DETAILS_BASE_CLASS, DETAILS_VARIANT_CLASS[variant], className)}
    >
      <summary className={cn(SUMMARY_CLASS, summaryClassName)}>
        <span className="min-w-0">{summary}</span>
        <Icon icon="lucide:chevron-down" size={16} className={CHEVRON_CLASS} />
      </summary>
      <div className={cn(BODY_CLASS, bodyClassName)}>{children}</div>
    </details>
  );
}
