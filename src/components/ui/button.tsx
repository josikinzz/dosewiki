import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200 hover:border-fuchsia-300/70 hover:bg-fuchsia-500/25",
        secondary:
          "rounded-xl border border-white/20 bg-white/10 text-white/75 hover:bg-white/15 hover:text-white",
        ghost:
          "rounded-xl text-white/60 hover:text-white hover:bg-white/10",
        destructive:
          "rounded-xl border border-red-400/40 bg-red-500/20 text-red-200 hover:border-red-300/60 hover:bg-red-500/30",
        success:
          "rounded-xl border border-emerald-400/50 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300 hover:bg-emerald-500/20 hover:text-white",
        outline:
          "rounded-xl border border-white/10 bg-transparent text-white/80 hover:bg-white/5",
        link:
          "text-fuchsia-200 underline-offset-4 hover:text-fuchsia-100 hover:underline",
        pill:
          "rounded-full border border-white/20 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white",
        pillActive:
          "rounded-full border-white/40 bg-white/20 text-white shadow-[0_10px_30px_-12px_rgba(168,85,247,0.65)]",
        glass:
          "rounded-full bg-white/[0.12] ring-1 ring-white/20 shadow-fuchsia-500/10 text-white/80 hover:bg-white/[0.16] hover:ring-white/35",
        ghostPill:
          "rounded-full border border-white/15 bg-white/10 text-white/70 hover:border-fuchsia-400/40 hover:bg-fuchsia-500/15 hover:text-white",
        destructivePill:
          "rounded-full border border-rose-500/50 bg-rose-500/10 text-rose-200 hover:border-rose-400 hover:bg-rose-500/20 hover:text-white",
        toggleActive:
          "rounded-full bg-gradient-to-tr from-fuchsia-500/25 via-fuchsia-500/10 to-white/10 text-white shadow-[0_18px_40px_-24px_rgba(155,65,255,0.6)] ring-1 ring-fuchsia-300/60",
        toggleInactive:
          "rounded-full bg-gradient-to-tr from-white/12 via-white/5 to-white/0 text-white/75 ring-1 ring-white/15 hover:text-white hover:ring-white/30",
        chip:
          "rounded-full bg-white/10 text-white/85 ring-1 ring-white/10 hover:bg-white/12 hover:text-fuchsia-200",
        listItem:
          "w-full justify-start rounded-xl text-left text-white/85 hover:bg-white/10 hover:text-fuchsia-300",
        card:
          "w-full items-start justify-between rounded-2xl border border-white/10 bg-white/5 text-left hover:border-fuchsia-400/40 hover:bg-white/10",
        suggestion:
          "w-full justify-between rounded-xl border border-transparent bg-white/5 text-left text-white/80 ring-1 ring-white/10 hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/40",
        suggestionActive:
          "w-full justify-between rounded-xl border border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-500/20 to-violet-500/10 text-left text-white ring-1 ring-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/40",
        tabPrimary:
          "flex-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 transition hover:text-white sm:flex-none sm:tracking-[0.3em] data-[active=true]:bg-fuchsia-500/20 data-[active=true]:text-white",
        tabPrimaryDisabled:
          "flex-1 cursor-not-allowed rounded-full text-[11px] font-semibold uppercase tracking-[0.2em] text-white/30 sm:flex-none sm:tracking-[0.3em]",
        tabSecondary:
          "flex-1 rounded-full text-sm font-medium text-white/70 transition hover:text-white sm:flex-none data-[active=true]:bg-fuchsia-500/20 data-[active=true]:text-white",
        tagRemove:
          "rounded-full p-0.5 text-white/50 transition hover:text-white",
        iconGhost:
          "rounded-xl p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white",
        categoryHeader:
          "flex flex-1 flex-col items-start text-left",
        searchOption:
          "flex h-auto w-full flex-col items-stretch justify-start gap-1.5 px-4 py-3 text-left text-sm whitespace-normal transition hover:bg-fuchsia-500/15 data-[highlighted=true]:bg-fuchsia-500/20 data-[highlighted=false]:bg-transparent",
        brand:
          "group/brand flex items-center gap-2 text-left",
        inlineLink:
          "text-left text-fuchsia-200 underline-offset-4 transition hover:text-fuchsia-100 hover:underline",
        dismissDanger:
          "absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-400/40 bg-red-500/20 text-red-200 transition hover:border-red-300/60 hover:bg-red-500/30 hover:text-red-50",
        sortIcon:
          "rounded-lg p-2 transition text-white/50 hover:bg-white/10 hover:text-white data-[active=true]:bg-fuchsia-500/20 data-[active=true]:text-fuchsia-300",
        substanceListItem:
          "w-full border-b border-white/5 px-4 py-2.5 text-left transition last:border-0 hover:bg-white/5 text-white/80 data-[active=true]:bg-fuchsia-500/20 data-[active=true]:text-fuchsia-200",
        textLink:
          "text-sm text-fuchsia-300 hover:text-fuchsia-200",
        generatePrimary:
          "inline-flex items-center gap-2 rounded-full px-6 py-2.5 font-medium transition bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-lg shadow-fuchsia-500/25 hover:shadow-fuchsia-500/40 disabled:cursor-not-allowed disabled:bg-white/10 disabled:from-white/10 disabled:to-white/10 disabled:text-white/40 disabled:shadow-none",
        generateCancel:
          "inline-flex items-center gap-2 rounded-full px-6 py-2.5 font-medium transition bg-red-500/20 text-red-200 hover:bg-red-500/30",
        iconSmall:
          "shrink-0 rounded p-1 text-white/40 transition hover:bg-white/10 hover:text-white",
        iconAction:
          "rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white",
        iconClose:
          "rounded-lg p-2 text-white/60 transition hover:bg-fuchsia-500/20 hover:text-white",
        iconWarning:
          "rounded-lg bg-amber-500/20 p-2 text-amber-200 transition hover:bg-amber-500/30",
        substanceLink:
          "text-sm font-semibold text-white transition hover:text-fuchsia-200 disabled:cursor-default disabled:text-white/80 disabled:opacity-100",
        pickerListItem:
          "w-full rounded-md px-2 py-1 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-fuchsia-200",
        addCard:
          "flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/12 bg-white/5 text-white/70 transition hover:border-fuchsia-400/30 hover:text-white",
        tagListItem:
          "w-full rounded-xl border px-4 py-3 text-left text-sm transition border-white/10 bg-white/5 text-white/75 hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10 hover:text-white data-[active=true]:border-fuchsia-400/70 data-[active=true]:bg-fuchsia-500/15 data-[active=true]:text-white data-[active=true]:shadow-inner data-[active=true]:shadow-fuchsia-500/25",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-sm",
        lg: "h-11 px-6",
        icon: "h-8 w-8",
        pill: "px-3.5 py-1.5 text-sm",
        xs: "h-7 px-2.5 text-xs",
        chip: "px-3.5 py-1.5 text-xs",
        chipXs: "px-3 py-1 text-xs font-medium uppercase tracking-[0.35em]",
        listItem: "px-3 py-2 text-sm",
        card: "gap-4 px-5 py-4",
        suggestion: "px-3 py-2 text-sm",
        tabPrimary: "min-w-[9rem] gap-2 px-4 py-2 sm:min-w-0",
        tabSecondary: "min-w-[8rem] gap-2 px-4 py-2 sm:min-w-0",
        addCard: "px-6 py-10",
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
