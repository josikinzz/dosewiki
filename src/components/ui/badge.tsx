import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-strong)] focus:ring-offset-2 focus:ring-offset-transparent",
  {
    variants: {
      variant: {
        default:
          "border-[var(--theme-frosted-panel-border)] bg-[var(--theme-frosted-control-bg)] text-[var(--theme-accent-strong)] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] font-medium",
        secondary:
          "border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] font-medium",
        destructive:
          "border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] text-[color:var(--theme-danger-text)] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] font-medium",
        outline:
          "border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] font-medium",
        success:
          "border-[color:var(--theme-success-border)] bg-[color:var(--theme-success-bg)] text-[color:var(--theme-success-text)] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] font-medium",
        interactive:
          "border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] text-[var(--theme-text-primary)] ring-1 ring-[var(--theme-border-subtle)] cursor-pointer hover:bg-[var(--theme-surface-soft)] hover:text-[var(--theme-text-primary)] px-2.5 py-0.5 text-[11px] uppercase tracking-[0.2em] font-medium",
        effect:
          "border-transparent bg-[var(--theme-frosted-control-bg)] px-3.5 py-1.5 text-xs text-[var(--theme-text-primary)] ring-1 ring-[var(--theme-frosted-control-border)]",
        effectInteractive:
          "border-transparent bg-[var(--theme-frosted-control-bg)] px-3.5 py-1.5 text-xs text-[var(--theme-text-primary)] ring-1 ring-[var(--theme-frosted-control-border)] cursor-pointer hover:bg-[var(--theme-frosted-control-hover-bg)] hover:text-[var(--theme-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]",
        ghostPill:
          "border-[var(--theme-border-subtle)] bg-[var(--theme-surface-deep)] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--theme-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
