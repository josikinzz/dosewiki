import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { Icon } from "./Icon";

type ExpandButtonVariant =
  | "floating"
  | "inline"
  | "count"
  | "chip"
  | "card"
  | "faint"
  | "pill"
  | "compact"
  | "badge";

interface ExpandButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  variant?: ExpandButtonVariant;
  count?: number;
  label?: string;
  children?: ReactNode;
  ariaLabel?: string;
  ariaControls?: string;
}

type CanonicalExpandButtonVariant = Exclude<ExpandButtonVariant, "pill" | "compact" | "badge">;

const CANONICAL_VARIANT_CLASSES = {
  floating:
    "theme-control-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
  inline:
    "inline-flex min-h-6 items-center gap-0.5 rounded-control px-1 py-0.5 text-xs transition-opacity hover:opacity-90",
  count:
    "theme-control-pill theme-control-pill-expander inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
  chip:
    "theme-control-pill inline-flex min-h-7 items-center gap-1.5 rounded-chip px-3.5 py-1 text-xs font-medium",
  card:
    "theme-control-pill-quiet inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs",
  faint:
    "theme-control-pill-faint inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
} as const satisfies Record<CanonicalExpandButtonVariant, string>;

const BUTTON_VARIANT_CLASSES = {
  ...CANONICAL_VARIANT_CLASSES,
  pill: CANONICAL_VARIANT_CLASSES.floating,
  compact: CANONICAL_VARIANT_CLASSES.inline,
  badge: CANONICAL_VARIANT_CLASSES.chip,
} as const satisfies Record<ExpandButtonVariant, string>;

const CANONICAL_ICON_SIZES = {
  floating: 14,
  inline: 12,
  count: 14,
  chip: 12,
  card: 14,
  faint: 14,
} as const satisfies Record<CanonicalExpandButtonVariant, number>;

const ICON_SIZES = {
  ...CANONICAL_ICON_SIZES,
  pill: CANONICAL_ICON_SIZES.floating,
  compact: CANONICAL_ICON_SIZES.inline,
  badge: CANONICAL_ICON_SIZES.chip,
} as const satisfies Record<ExpandButtonVariant, number>;

export function ExpandIndicator({
  isExpanded,
  className,
  variant = "inline",
  iconSize = ICON_SIZES[variant],
}: {
  isExpanded: boolean;
  className?: string;
  variant?: Extract<ExpandButtonVariant, "floating" | "inline" | "card" | "pill" | "compact">;
  iconSize?: number;
}) {
  return (
    <span
      aria-hidden="true"
      data-expand-indicator=""
      className={cn(
        "inline-flex items-center gap-0.5",
        variant === "floating" || variant === "pill"
          ? "theme-control-pill rounded-full px-2.5 py-1"
          : undefined,
        variant === "card" ? "theme-control-pill-quiet rounded-full px-2.5 py-1" : undefined,
        className,
      )}
    >
      <Icon icon="lucide:ellipsis" size={iconSize} />
      <Icon
        icon="lucide:chevron-down"
        size={iconSize}
        className={cn("transition-transform duration-[var(--motion-base)] motion-reduce:transition-none", isExpanded && "rotate-180")}
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
        "theme-focus-ring",
        TOUCH_HALO,
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
          className={cn("transition-transform duration-[var(--motion-base)] motion-reduce:transition-none", isExpanded && "rotate-180")}
        />
      ) : (
        <ExpandIndicator isExpanded={isExpanded} iconSize={iconSize} />
      )}
    </button>
  );
}
