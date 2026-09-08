import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { focusRingClassName } from "./surface"

// Keyboard focus uses the shared 2px accent outline, not a ring: the former
// `focus:ring-2 focus:ring-[var(--theme-ring-soft)]` never painted here, and
// `--theme-ring-soft` is 12% white, which cannot reach the 3:1 focus-appearance
// threshold even when it does paint. It was also keyed on `focus:` rather than
// `focus-visible:`, so the intent fired on mouse clicks too.
const inputVariants = cva(
  cn(
    "flex w-full rounded-xl border border-[var(--theme-border-subtle)] bg-[var(--theme-field-surface)] text-[var(--theme-text-primary)] shadow-[var(--theme-elevation-field-inset)] transition placeholder:text-[var(--theme-text-faint)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--theme-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
    focusRingClassName,
  ),
  {
    variants: {
      variant: {
        default: "focus:border-[var(--theme-accent-strong)]",
        error:
          "border-[color:var(--theme-danger-border)] focus-visible:outline-[color:var(--theme-danger-border-strong)]",
      },
      inputSize: {
        default: "h-11 px-3 py-2 text-[16px] md:text-sm",
        sm: "h-10 px-3 py-2 text-[16px] md:text-sm",
        lg: "h-12 px-4 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      inputSize: "default",
    },
  }
)

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, inputSize, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant, inputSize }), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }
