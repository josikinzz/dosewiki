import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "theme-focus-ring inline-flex items-center justify-center text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 gap-2",
  {
    variants: {
      variant: {
        default:
          "rounded-control border border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)] hover:[background:var(--theme-frosted-control-bg)] hover:text-[var(--theme-text-primary)] data-[state=on]:border-[var(--theme-frosted-control-hover-border)] data-[state=on]:[background:var(--theme-frosted-control-hover-bg)] data-[state=on]:text-[var(--theme-text-primary)] data-[state=on]:shadow-[var(--theme-elevation-control-active)]",
        outline:
          "rounded-control border border-[var(--theme-border-subtle)] bg-transparent hover:[background:var(--theme-frosted-control-bg)] data-[state=on]:border-[var(--theme-frosted-control-hover-border)] data-[state=on]:[background:var(--theme-frosted-control-hover-bg)] data-[state=on]:text-[var(--theme-accent-strong)]",
        pill:
          "rounded-full border border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)] hover:[background:var(--theme-frosted-control-bg)] hover:text-[var(--theme-text-primary)] data-[state=on]:border-[var(--theme-frosted-control-hover-border)] data-[state=on]:[background:var(--theme-frosted-control-hover-bg)] data-[state=on]:text-[var(--theme-text-primary)] data-[state=on]:shadow-[var(--theme-elevation-control-active)]",
      },
      size: {
        default: "h-10 px-3 min-w-10",
        sm: "h-9 px-2.5 min-w-9",
        lg: "h-11 px-5 min-w-11",
        pill: "px-3.5 py-1.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Toggle = React.forwardRef<
  React.ComponentRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
    VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, size, className }))}
    {...props}
  />
))

Toggle.displayName = TogglePrimitive.Root.displayName

export { Toggle, toggleVariants }
