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
  /** "danger" inks the remove control when removing is a production write, not a decorative untag. */
  removeTone?: "default" | "danger";
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
    "gap-1.5 rounded-lg border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] px-2.5 py-1 text-sm text-[color:var(--theme-danger-text)]",
};

export function TagToken({
  label,
  variant = "default",
  disabled = false,
  onRemove,
  removeLabel,
  removeTone = "default",
  className,
  ...props
}: TagTokenProps) {
  const canRemove = Boolean(onRemove) && !disabled && variant !== "readonly";
  const iconSize = variant === "compact" ? 10 : 12;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center border border-[color:var(--editor-chip-border)] bg-[var(--editor-chip-bg)] font-medium text-[var(--editor-chip-text)] shadow-[var(--theme-elevation-sm)]",
        tagTokenVariantClasses[variant],
        disabled ? "opacity-60" : undefined,
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{label}</span>
      {canRemove ? (
        <Button
          type="button"
          variant="tagRemove"
          size="auto"
          className={
            removeTone === "danger"
              ? "text-dose-danger hover:bg-[rgb(var(--c-rose)/0.16)] hover:text-dose-danger"
              : undefined
          }
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
