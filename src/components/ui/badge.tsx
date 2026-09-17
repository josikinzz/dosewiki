import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "theme-focus-ring inline-flex items-center rounded-full border transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-[var(--theme-frosted-panel-border)] [background:var(--theme-frosted-control-bg)] text-[var(--theme-accent-strong)] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] font-medium",
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
          "border-transparent [background:var(--theme-frosted-control-bg)] px-3.5 py-1.5 text-xs text-[var(--theme-text-primary)] ring-1 ring-[var(--theme-frosted-control-border)]",
        effectInteractive:
          "border-transparent [background:var(--theme-frosted-control-bg)] px-3.5 py-1.5 text-xs text-[var(--theme-text-primary)] ring-1 ring-[var(--theme-frosted-control-border)] cursor-pointer hover:[background:var(--theme-frosted-control-hover-bg)] hover:text-[var(--theme-accent-strong)]",
        ghostPill:
          "border-[var(--theme-border-subtle)] bg-[var(--theme-surface-deep)] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--theme-text-secondary)] shadow-[var(--theme-elevation-top-highlight-faint)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * Render the badge as its single child instead of a `div` — the same escape
   * hatch `Button` has. Use it when a badge sits inside phrasing content (a
   * label, a caption, the inside of a button) where a block element is invalid.
   */
  asChild?: boolean
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "div"
  return (
    <Comp className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
