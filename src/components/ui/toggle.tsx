import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "inline-flex items-center justify-center text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 gap-2",
  {
    variants: {
      variant: {
        default:
          "rounded-xl border border-white/20 bg-white/0 text-white/75 hover:bg-white/10 hover:text-white data-[state=on]:border-white/40 data-[state=on]:bg-white/20 data-[state=on]:text-white data-[state=on]:shadow-[0_10px_30px_-12px_rgba(168,85,247,0.65)]",
        outline:
          "rounded-xl border border-white/10 bg-transparent hover:bg-white/5 data-[state=on]:border-fuchsia-400/40 data-[state=on]:bg-fuchsia-500/15 data-[state=on]:text-fuchsia-200",
        pill:
          "rounded-full border border-white/20 bg-white/0 text-white/75 hover:bg-white/10 hover:text-white data-[state=on]:border-white/40 data-[state=on]:bg-white/20 data-[state=on]:text-white data-[state=on]:shadow-[0_10px_30px_-12px_rgba(168,85,247,0.65)]",
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
  React.ElementRef<typeof TogglePrimitive.Root>,
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
