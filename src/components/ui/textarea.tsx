import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const textareaVariants = cva(
  "flex w-full rounded-xl border bg-slate-950/60 text-white shadow-inner shadow-black/20 transition placeholder:text-white/45 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-white/10 focus:border-fuchsia-400 focus:ring-fuchsia-300/30",
        error: "border-red-400/50 focus:border-red-400 focus:ring-red-300/30",
      },
      textareaSize: {
        default: "min-h-[80px] px-3 py-3 text-[16px] md:text-sm",
        sm: "min-h-[60px] px-3 py-2 text-sm",
        lg: "min-h-[120px] px-4 py-4 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      textareaSize: "default",
    },
  }
)

export interface TextareaProps
  extends React.ComponentProps<"textarea">,
    VariantProps<typeof textareaVariants> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, textareaSize, ...props }, ref) => {
    return (
      <textarea
        className={cn(textareaVariants({ variant, textareaSize }), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea, textareaVariants }
