import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:ring-offset-2 focus:ring-offset-transparent",
  {
    variants: {
      variant: {
        default:
          "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-200/90 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.2em] font-medium",
        secondary:
          "border-white/10 bg-white/10 text-white/70 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.2em] font-medium",
        destructive:
          "border-red-400/40 bg-red-500/20 text-red-200 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.2em] font-medium",
        outline:
          "border-white/10 bg-transparent text-white/70 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.2em] font-medium",
        success:
          "border-emerald-400/40 bg-emerald-500/10 text-emerald-200 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.2em] font-medium",
        interactive:
          "border-white/10 bg-white/10 text-white/85 ring-1 ring-white/10 cursor-pointer hover:bg-white/15 hover:text-white px-2.5 py-0.5 text-[11px] uppercase tracking-[0.2em] font-medium",
        effect:
          "border-transparent bg-white/10 px-3.5 py-1.5 text-xs text-white/85 ring-1 ring-white/10",
        effectInteractive:
          "border-transparent bg-white/10 px-3.5 py-1.5 text-xs text-white/85 ring-1 ring-white/10 cursor-pointer hover:bg-white/12 hover:text-fuchsia-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400",
        ghostPill:
          "border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.35em] text-white/70",
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
