import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { cva, type VariantProps } from "class-variance-authority"
import { Icon } from "@/components/common/Icon"
import { TOUCH_PILL } from "@/components/ui/touchTargets"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const selectTriggerVariants = cva(
  "theme-field-focus flex w-full items-center justify-between rounded-control border bg-[var(--theme-field-surface)] text-[var(--theme-text-primary)] shadow-[var(--theme-elevation-inner)] transition placeholder:text-[var(--theme-text-faint)] data-[placeholder]:text-[var(--theme-text-faint)] disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
  {
    variants: {
      variant: {
        default: "border-[var(--theme-field-border)]",
        error: "border-[color:var(--theme-danger-border-strong)] ring-1 ring-inset ring-[var(--theme-danger-border-strong)] focus:border-[color:var(--theme-danger-text)]",
      },
      selectSize: {
        sm: `h-10 px-3 py-2 pr-10 text-[16px] md:text-sm ${TOUCH_PILL}`,
        default: "h-11 px-4 py-2 pr-12 text-sm",
        compact: "h-11 px-4 py-2 pr-10 text-sm",
        lg: "h-12 px-4 py-3 pr-12 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      selectSize: "default",
    },
  }
)

export interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectTriggerVariants> {}

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, variant, selectSize, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn("relative", selectTriggerVariants({ variant, selectSize }), className)}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <Icon icon="lucide:chevron-down" size={16} className="theme-text-faint absolute right-3" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "theme-text-muted flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <Icon icon="lucide:chevron-up" size={16} />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "theme-text-muted flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <Icon icon="lucide:chevron-down" size={16} />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "theme-overlay-surface relative z-[90] max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-control border shadow-[var(--theme-elevation-lg)] backdrop-blur-sm",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-select-content-transform-origin)",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("theme-text-faint py-1.5 pl-8 pr-2 text-xs font-medium uppercase tracking-wider", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "theme-text-secondary relative flex w-full cursor-pointer select-none items-center rounded-chip py-2 pl-8 pr-2 text-sm outline-none transition",
      "focus:[background:var(--theme-frosted-control-on-panel-bg)] focus:text-[var(--theme-text-primary)]",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Icon icon="lucide:check" size={16} className="theme-accent-emphasis" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("theme-gradient-divider -mx-1 my-1 h-px", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  selectTriggerVariants,
}
