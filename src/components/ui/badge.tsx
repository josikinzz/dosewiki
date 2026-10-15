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
          "h-6 px-2.5 type-chip-label border-[var(--theme-frosted-panel-border)] [background:var(--theme-frosted-control-bg)] text-[var(--theme-accent-strong)]",
        secondary:
          "h-6 px-2.5 type-chip-label theme-frosted-control border-[var(--theme-border-subtle)] text-[var(--theme-text-secondary)]",
        destructive:
          "h-6 px-2.5 type-chip-label border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] text-[color:var(--theme-danger-text)]",
        outline:
          "h-6 px-2.5 type-chip-label border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)]",
        success:
          "h-6 px-2.5 type-chip-label border-[color:var(--theme-success-border)] bg-[color:var(--theme-success-bg)] text-[color:var(--theme-success-text)]",
        interactive:
          "h-6 px-2.5 type-chip-label theme-frosted-control theme-frosted-control-hover border-[var(--theme-border-subtle)] text-[var(--theme-text-primary)] cursor-pointer",
        effect:
          "border-transparent [background:var(--theme-frosted-control-bg)] h-7 px-3 text-xs text-[var(--theme-text-primary)] ring-1 ring-[var(--theme-frosted-control-border)]",
        effectInteractive:
          "border-transparent [background:var(--theme-frosted-control-bg)] h-7 px-3 text-xs text-[var(--theme-text-primary)] ring-1 ring-[var(--theme-frosted-control-border)] cursor-pointer hover:[background:var(--theme-frosted-control-hover-bg)] hover:text-[var(--theme-accent-strong)]",
        ghostPill:
          "border-[var(--theme-border-subtle)] bg-[var(--theme-surface-deep)] h-7 px-3.5 type-chip-label text-[var(--theme-text-secondary)] shadow-[var(--theme-elevation-top-highlight-faint)]",
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
  asChild?: boolean
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "div"
  return (
    <Comp className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
