import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "theme-focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-control border border-[var(--theme-frosted-panel-border)] [background:var(--theme-frosted-control-bg)] text-[var(--theme-accent-strong)] hover:border-[var(--theme-frosted-control-hover-border)] hover:[background:var(--theme-frosted-control-hover-bg)]",
        accent:
          "rounded-control border border-transparent theme-cta-accent",
        secondary:
          "rounded-control border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] hover:text-[var(--theme-text-primary)]",
        ghost:
          "rounded-control text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-surface-muted)]",
        destructive:
          "rounded-control border border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] text-[color:var(--theme-danger-text)] hover:border-[color:var(--theme-danger-border-strong)] hover:bg-[color:var(--theme-danger-bg-strong)]",
        ghostDestructive:
          "rounded-control border border-transparent bg-transparent text-[color:var(--theme-danger-text)] hover:bg-[color:var(--theme-danger-bg)] hover:text-[color:var(--theme-danger-text-strong)]",
        success:
          "rounded-control border border-[color:var(--theme-success-border)] bg-[color:var(--theme-success-bg)] text-[color:var(--theme-success-text)] hover:border-[color:var(--theme-success-border-strong)] hover:bg-[color:var(--theme-success-bg-strong)] hover:text-[color:var(--theme-success-text-strong)]",
        outline:
          "rounded-control border border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-muted)]",
        link:
          "text-[var(--theme-accent-strong)] underline-offset-4 hover:text-[var(--theme-accent)] hover:underline",
        pill:
          "rounded-full border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] hover:text-[var(--theme-text-primary)]",
        pillActive:
          "rounded-full border-[var(--theme-frosted-control-hover-border)] [background:var(--theme-frosted-control-hover-bg)] text-[var(--theme-text-primary)] shadow-[var(--theme-elevation-control-active)]",
        quiet:
          "rounded-full bg-transparent font-medium text-[var(--theme-text-faint)] hover:bg-transparent hover:text-[var(--theme-text-primary)]",
        quietActive:
          "rounded-full bg-transparent theme-accent-emphasis font-semibold text-[var(--theme-accent-strong)] hover:bg-transparent hover:text-[var(--theme-accent-strong)]",
        glass:
          "rounded-full [background:var(--theme-frosted-control-bg)] ring-1 ring-[var(--theme-frosted-control-border)] text-[var(--theme-text-primary)] hover:[background:var(--theme-frosted-control-hover-bg)] hover:ring-[var(--theme-frosted-control-hover-border)]",
        ghostPill:
          "rounded-full border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-frosted-panel-border)] hover:[background:var(--theme-frosted-control-bg)] hover:text-[var(--theme-text-primary)]",
        destructivePill:
          "rounded-full border border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] text-[color:var(--theme-danger-text)] hover:border-[color:var(--theme-danger-border-strong)] hover:bg-[color:var(--theme-danger-bg-strong)] hover:text-[color:var(--theme-danger-text-strong)]",
        toggleActive:
          "rounded-full bg-gradient-to-tr from-[color-mix(in_srgb,rgb(var(--c-brand))_25%,var(--theme-control-base))] via-[color-mix(in_srgb,rgb(var(--c-brand))_10%,var(--theme-control-base))] to-[color-mix(in_srgb,#fff_10%,var(--theme-control-base))] text-[var(--theme-text-primary)] shadow-[var(--theme-elevation-control-primary)] ring-1 ring-[var(--theme-frosted-control-hover-border)]",
        toggleInactive:
          "rounded-full bg-gradient-to-tr from-[color-mix(in_srgb,#fff_12%,var(--theme-control-base))] via-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] to-[var(--theme-control-base)] text-[var(--theme-text-secondary)] ring-1 ring-[var(--theme-border-subtle)] hover:text-[var(--theme-text-primary)] hover:ring-[var(--theme-border-strong)]",
        chip:
          "rounded-full [background:var(--theme-frosted-control-bg)] text-[var(--theme-text-primary)] ring-1 ring-[var(--theme-frosted-control-border)] hover:[background:var(--theme-frosted-control-hover-bg)] hover:text-[var(--theme-accent-strong)]",
        listItem:
          "w-full justify-start rounded-control text-left text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-accent-strong)]",
        card:
          "w-full items-start justify-between rounded-card border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] text-left hover:border-[var(--theme-frosted-panel-hover-border)] hover:bg-[var(--theme-surface-soft)]",
        suggestion:
          "w-full justify-between rounded-control border border-transparent bg-[var(--theme-surface-muted)] text-left text-[var(--theme-text-secondary)] ring-1 ring-[var(--theme-border-subtle)] hover:border-[var(--theme-frosted-panel-border)] hover:[background:var(--theme-frosted-control-bg)] hover:text-[var(--theme-text-primary)]",
        suggestionActive:
          "w-full justify-between rounded-control border border-[var(--theme-frosted-control-hover-border)] bg-gradient-to-r from-[color-mix(in_srgb,rgb(var(--c-brand))_20%,var(--theme-control-base))] to-[color-mix(in_srgb,rgb(var(--c-violet))_10%,var(--theme-control-base))] text-left text-[var(--theme-text-primary)] ring-1 ring-[var(--theme-border-subtle)]",
        tagRemove:
          "rounded-full p-0.5 text-[var(--theme-text-muted)] transition hover:text-[var(--theme-text-primary)]",
        iconGhost:
          "rounded-control p-1.5 text-[var(--theme-text-secondary)] transition hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]",
        textLink:
          "text-sm text-[var(--theme-accent-strong)] hover:text-[var(--theme-accent)]",
        iconSmall:
          "shrink-0 rounded-chip p-1 text-[var(--theme-text-faint)] transition hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]",
        iconAction:
          "rounded-chip p-2 text-[var(--theme-text-secondary)] transition hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]",
        iconClose:
          "rounded-chip p-2 text-[var(--theme-text-muted)] transition hover:[background:var(--theme-frosted-control-bg)] hover:text-[var(--theme-text-primary)]",
        iconWarning:
          "rounded-chip bg-[color:var(--theme-warning-bg)] p-2 text-[color:var(--theme-warning-text)] transition hover:bg-[color:var(--theme-warning-bg-strong)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-sm [@media(pointer:coarse)]:h-auto [@media(pointer:coarse)]:min-h-11",
        lg: "h-11 px-6",
        icon: "h-11 w-11",
        pill: "px-3.5 py-1.5 text-sm [@media(pointer:coarse)]:min-h-11",
        pillLg: "min-h-11 rounded-full px-5 py-2.5 font-semibold",
        quiet: "min-h-8 gap-1.5 px-3 py-1 text-xs [&_svg]:size-[15px] [@media(pointer:coarse)]:min-h-11",
        xs: "h-10 px-3 text-xs [@media(pointer:coarse)]:h-auto [@media(pointer:coarse)]:min-h-11",
        chip: "px-3.5 py-1.5 text-xs [@media(pointer:coarse)]:min-h-11",
        chipXs: "px-3 py-1 text-xs font-medium uppercase tracking-[0.35em]",
        listItem: "px-3 py-2 text-sm",
        card: "gap-4 px-5 py-4",
        suggestion: "px-3 py-2 text-sm",
        auto: "h-auto w-auto",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
