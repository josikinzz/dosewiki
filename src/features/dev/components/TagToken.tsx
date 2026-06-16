import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export interface TagTokenProps extends HTMLAttributes<HTMLSpanElement> {
  label: ReactNode;
  variant?: "default" | "compact" | "interactive" | "readonly" | "danger";
  disabled?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}

const tagTokenVariantClasses: Record<NonNullable<TagTokenProps["variant"]>, string> = {
  default:
    "gap-1.5 rounded-lg px-2.5 py-1 text-sm",
  compact:
    "gap-1 rounded-md px-1.5 py-0.5 text-xs",
  interactive:
    "gap-1.5 rounded-lg px-2.5 py-1 text-sm hover:border-[color:var(--editor-panel-border-strong)] hover:bg-[var(--editor-panel-bg-subtle)]",
  readonly:
    "gap-1.5 rounded-lg px-2.5 py-1 text-sm opacity-80",
  danger:
    "gap-1.5 rounded-lg border-rose-400/30 bg-[color-mix(in_srgb,#f43f5e_10%,var(--theme-control-base))] px-2.5 py-1 text-sm text-rose-100",
};

export function TagToken({
  label,
  variant = "default",
  disabled = false,
  onRemove,
  removeLabel,
  className,
  ...props
}: TagTokenProps) {
  const canRemove = Boolean(onRemove) && !disabled && variant !== "readonly";
  const iconSize = variant === "compact" ? 10 : 12;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center border border-[color:var(--editor-chip-border)] bg-[var(--editor-chip-bg)] font-medium text-[var(--editor-chip-text)] shadow-sm",
        tagTokenVariantClasses[variant],
        disabled ? "opacity-60" : undefined,
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{label}</span>
      {canRemove ? (
        <Button
          variant="tagRemove"
          size="auto"
          aria-label={removeLabel ?? `Remove ${String(label)}`}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onRemove?.();
          }}
        >
          <Icon icon="lucide:x" size={iconSize} />
        </Button>
      ) : null}
    </span>
  );
}
