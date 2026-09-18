import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "theme-field-focus flex w-full rounded-control border border-[var(--theme-field-border)] bg-[var(--theme-field-surface)] text-[var(--theme-text-primary)] shadow-[var(--theme-elevation-field-inset)] transition placeholder:text-[var(--theme-text-faint)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--theme-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
  {
    variants: {
      variant: {
        default: "",
        error:
          "border-[color:var(--theme-danger-border-strong)] ring-1 ring-inset ring-[var(--theme-danger-border-strong)] focus:border-[color:var(--theme-danger-text)]",
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
