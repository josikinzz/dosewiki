import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "flex w-full rounded-xl border bg-slate-950/60 text-white shadow-inner shadow-black/20 transition placeholder:text-white/45 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white/80 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-white/10 focus:border-fuchsia-400 focus:ring-fuchsia-300/30",
        error: "border-red-400/50 focus:border-red-400 focus:ring-red-300/30",
      },
      inputSize: {
        default: "h-10 px-3 py-2 text-[16px] md:text-sm",
        sm: "h-8 px-3 py-1.5 text-sm",
        lg: "h-11 px-4 py-3 text-base",
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
