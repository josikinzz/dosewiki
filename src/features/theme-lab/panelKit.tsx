"use client";

import type { ReactNode } from "react";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import { TOUCH_ICON, TOUCH_PILL } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/common/Icon";
import styles from "./ThemeLab.module.css";

const ROUTE_TAB = "theme-selected-control border border-transparent";

export const PANEL_ICON = {
  10: "[&_svg]:size-[10px]",
  13: "[&_svg]:size-[13px]",
  14: "[&_svg]:size-[14px]",
  15: "[&_svg]:size-[15px]",
  16: "[&_svg]:size-[16px]",
} as const;

interface ToggleProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  title?: string;
}

export function PanelTab({ active, onClick, children, className, ...rest }: ToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="auto"
      data-state={active ? "active" : "inactive"}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        ROUTE_TAB,
        TOUCH_PILL,
        "min-h-8 flex-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-semibold",
        className,
      )}
      {...rest}
    >
      {children}
    </Button>
  );
}

export function PanelChip({ active, onClick, children, className, ...rest }: ToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="auto"
      data-state={active ? "active" : "inactive"}
      aria-pressed={active}
      onClick={onClick}
      className={cn(ROUTE_TAB, TOUCH_PILL, PANEL_ICON[15], "min-h-8 rounded-full px-3.5 py-1.5", className)}
      {...rest}
    >
      {children}
    </Button>
  );
}

interface IconButtonProps {
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  className?: string;
  "aria-label": string;
  "aria-pressed"?: boolean;
  title?: string;
}

export function PanelIconButton({ onClick, children, active, className, ...rest }: IconButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? "pillActive" : "ghostPill"}
      size="auto"
      onClick={onClick}
      className={cn(
        "h-[1.875rem] w-[1.875rem] shrink-0 p-0",
        TOUCH_ICON,
        PANEL_ICON[15],
        active && "border",
        className,
      )}
      {...rest}
    >
      {children}
    </Button>
  );
}

export function PanelRow({
  active,
  inert,
  onClick,
  children,
}: {
  active: boolean;
  inert?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="auto"
      data-state={active ? "active" : "inactive"}
      onClick={onClick}
      className={cn(
        ROUTE_TAB,
        TOUCH_PILL,
        PANEL_ICON[10],
        "w-full min-h-8 justify-start gap-2 rounded-lg px-1.5 py-1 text-left",
        inert && "opacity-60 hover:opacity-100",
      )}
    >
      {children}
    </Button>
  );
}

export function PanelBadge({
  variant,
  className,
  children,
  title,
}: {
  variant?: "default" | "secondary" | "outline" | "destructive" | "success";
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <Badge
      asChild
      variant={variant}
      title={title}
      className={cn(
        "shrink-0 px-1.5 py-0 text-[0.6875rem] font-semibold tracking-normal normal-case",
        className,
      )}
    >
      <span>{children}</span>
    </Badge>
  );
}

export function PanelInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input inputSize="sm" className={cn("[@media(pointer:coarse)]:text-base", className)} {...props} />;
}

export function PanelTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      textareaSize="sm"
      spellCheck={false}
      className={cn("resize-y font-mono text-xs leading-relaxed", className)}
      {...props}
    />
  );
}

export function PanelDisclosure({
  label,
  hint,
  open,
  controls,
  onToggle,
}: {
  label: string;
  hint: string;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="auto"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        TOUCH_PILL,
        PANEL_ICON[14],
        "w-full min-h-8 justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left",
      )}
    >
      <span className={styles.advancedToggleText}>
        <span className={styles.advancedToggleLabel}>{label}</span>
        <span className={styles.advancedToggleHint}>{hint}</span>
      </span>
      <Icon
        icon="lucide:chevron-right"
        size={14}
        className={cn(styles.advancedCaret, open && styles.advancedCaretOpen)}
      />
    </Button>
  );
}

export function PanelButton({
  variant = "default",
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant={variant}
      size="auto"
      className={cn(
        TOUCH_PILL,
        PANEL_ICON[14],
        "min-h-8 gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold",
        className,
      )}
      {...props}
    />
  );
}
