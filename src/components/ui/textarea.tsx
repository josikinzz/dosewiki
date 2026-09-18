import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const textareaVariants = cva(
  "theme-field-focus flex w-full rounded-control border border-[var(--theme-field-border)] bg-[var(--theme-field-surface)] text-[var(--theme-text-primary)] shadow-[var(--theme-elevation-field-inset)] transition placeholder:text-[var(--theme-text-faint)] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        error: "border-[color:var(--theme-danger-border-strong)] ring-1 ring-inset ring-[var(--theme-danger-border-strong)] focus:border-[color:var(--theme-danger-text)]",
      },
      textareaSize: {
        default: "min-h-[80px] px-3 py-3 text-[16px] md:text-sm",
        sm: "min-h-[60px] px-3 py-2 text-[16px] md:text-sm",
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
