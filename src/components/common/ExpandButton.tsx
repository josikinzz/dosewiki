import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { TOUCH_ICON, TOUCH_PILL } from "@/components/ui/touchTargets";
import { Icon } from "./Icon";

type ExpandButtonVariant =
  | "floating"
  | "inline"
  | "count"
  | "chip"
  | "card"
  /** Faint resting tint that fills with the frosted control on hover/focus.
   *  For tertiary inline expanders that should not out-shout body copy. */
  | "faint"
  /** @deprecated Use floating. */
  | "pill"
  /** @deprecated Use inline for badge/value-row affordances or card for contained card controls. */
  | "compact"
  /** @deprecated Use chip. */
  | "badge";

interface ExpandButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  variant?: ExpandButtonVariant;
  count?: number;
  /** When provided, shows a descriptive label instead of the ellipsis icon */
  label?: string;
  children?: ReactNode;
  ariaLabel?: string;
  ariaControls?: string;
}

const BUTTON_VARIANT_CLASSES = {
  floating:
    "theme-control-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
  inline:
    "inline-flex min-h-6 items-center gap-0.5 rounded-md px-1 py-0.5 text-xs transition-opacity hover:opacity-90",
  count:
    "theme-control-pill theme-control-pill-expander inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
  chip:
    "theme-control-pill inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium",
  card:
    "theme-control-pill-quiet inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs",
  faint:
    "theme-control-pill-faint inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
  pill:
    "theme-control-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
  compact:
    "inline-flex min-h-6 items-center gap-0.5 rounded-md px-1 py-0.5 text-xs transition-opacity hover:opacity-90",
  badge:
    "theme-control-pill inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium",
} as const;

const ICON_SIZES = {
  floating: 14,
  inline: 13,
  count: 14,
  chip: 12,
  card: 13,
  faint: 13,
  pill: 14,
  compact: 13,
  badge: 12,
} as const;

export function ExpandIndicator({
  isExpanded,
  className,
  variant = "inline",
}: {
  isExpanded: boolean;
  className?: string;
  variant?: Extract<ExpandButtonVariant, "floating" | "inline" | "card" | "pill" | "compact">;
}) {
  const iconSize = ICON_SIZES[variant];

  return (
    <span
      aria-hidden="true"
      data-expand-indicator=""
      className={cn(
        "inline-flex items-center gap-0.5",
        variant === "floating" || variant === "pill"
          ? "theme-control-pill rounded-full px-2.5 py-1"
          : undefined,
        variant === "card" ? "theme-control-pill-quiet rounded-full px-2 py-1" : undefined,
        className,
      )}
    >
      <Icon icon="lucide:ellipsis" size={iconSize} />
      <Icon
        icon="lucide:chevron-down"
        size={iconSize}
        className={cn("transition-transform duration-200 ease-out motion-reduce:transition-none", isExpanded && "rotate-180")}
      />
    </span>
  );
}

export function ExpandButton({
  isExpanded,
  onToggle,
  className = "",
  variant = "floating",
  count,
  label,
  children,
  ariaLabel,
  ariaControls,
}: ExpandButtonProps) {
  // Always under a client boundary: `onToggle` is a function prop, which only
  // a client component can supply, so the hook is safe without a directive.
  const t = useT();
  const iconSize = ICON_SIZES[variant];

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls={ariaControls}
      aria-label={ariaLabel ?? (isExpanded ? t("Collapse section") : t("Expand section"))}
      className={cn(
        "relative",
        "theme-focus-ring",
        "before:absolute before:inset-[-0.5rem] before:content-['']",
        "before:pointer-events-auto",
        "[@media(pointer:fine)]:before:inset-0",
        label || children != null || variant === "count" ? TOUCH_PILL : TOUCH_ICON,
        BUTTON_VARIANT_CLASSES[variant],
        className
      )}
    >
      {variant === "count" ? (
        <>
          {children != null ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {children}
            </span>
          ) : label ? (
            <span className="min-w-0">{label}</span>
          ) : null}
          <span className="font-medium">
            {isExpanded ? "-" : "+"}
            {count ?? 0}
          </span>
        </>
      ) : label ? (
        <span>{label}</span>
      ) : (
        children
      )}
      {variant === "count" ? (
        <Icon
          icon="lucide:chevron-down"
          size={iconSize}
          className={cn("transition-transform duration-200 ease-out motion-reduce:transition-none", isExpanded && "rotate-180")}
        />
      ) : (
        <ExpandIndicator isExpanded={isExpanded} />
      )}
    </button>
  );
}
