import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

interface ExpandButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  variant?: "pill" | "compact" | "count" | "badge";
  count?: number;
  /** When provided, shows a descriptive label instead of the ellipsis icon */
  label?: string;
  children?: ReactNode;
  ariaLabel?: string;
}

const BUTTON_VARIANT_CLASSES = {
  pill:
    "inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80",
  compact:
    "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-white/50 transition hover:bg-white/10 hover:text-white/80",
  count:
    "inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80",
  badge:
    "inline-flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-white/85 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-fuchsia-200",
} as const;

const ICON_SIZES = {
  pill: 14,
  compact: 12,
  count: 14,
  badge: 12,
} as const;

export function ExpandButton({
  isExpanded,
  onToggle,
  className = "",
  variant = "pill",
  count,
  label,
  children,
  ariaLabel,
}: ExpandButtonProps) {
  const iconSize = ICON_SIZES[variant];

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-label={ariaLabel ?? (isExpanded ? "Collapse section" : "Expand section")}
      className={cn(
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400",
        BUTTON_VARIANT_CLASSES[variant],
        className
      )}
    >
      {variant === "count" ? (
        <span className="font-medium">+{count ?? 0}</span>
      ) : label ? (
        <span>{label}</span>
      ) : (
        children
      )}
      {variant !== "count" && <Icon icon="lucide:ellipsis" size={iconSize} />}
      <Icon
        icon="lucide:chevron-down"
        size={iconSize}
        className={cn("transition-transform duration-200", isExpanded && "rotate-180")}
      />
    </button>
  );
}
