import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-card border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4",
  {
    variants: {
      variant: {
        default:
          "theme-card-surface text-[var(--theme-text-primary)] [&>svg]:text-[var(--theme-text-muted)]",
        destructive:
          "border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] text-[color:var(--theme-danger-text)] [&>svg]:text-[color:var(--theme-danger-text-strong)]",
        warning:
          "border-[color:var(--theme-warning-border)] bg-[color:var(--theme-warning-bg)] text-[color:var(--theme-warning-text)] [&>svg]:text-[color:var(--theme-warning-text-strong)]",
        success:
          "border-[color:var(--theme-success-border)] bg-[color:var(--theme-success-bg)] text-[color:var(--theme-success-text)] [&>svg]:text-[color:var(--theme-success-text-strong)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, role, ...props }, ref) => {
  // Explicit role wins; otherwise default by tone. `destructive` is urgent, so
  // it asserts via role="alert" (implies aria-live="assertive"). Every other
  // variant is informational and announces politely via role="status" (implies
  // aria-live="polite") — so no explicit aria-live attribute is needed.
  const resolvedRole = role ?? (variant === "destructive" ? "alert" : "status")
  return (
    <div
      ref={ref}
      role={resolvedRole}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
})
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  >
    {children}
  </h5>
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
