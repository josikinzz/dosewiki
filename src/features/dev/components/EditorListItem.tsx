import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface EditorListRowSlots {
  active?: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  leading?: ReactNode;
}

export interface EditorListItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title">,
    EditorListRowSlots {
  onSelect?: () => void;
}

export interface EditorListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "title">, EditorListRowSlots {}

function rowClassName(active: boolean, className: string | undefined) {
  return cn(
    "theme-dev-list-row group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
    active
      ? "border-[color:var(--theme-frosted-control-on-panel-hover-border)] [background:var(--theme-frosted-control-on-panel-hover-bg)] shadow-[var(--theme-frosted-control-on-panel-hover-shadow)]"
      : "border-transparent [background:var(--theme-frosted-control-on-panel-bg)] shadow-[var(--theme-frosted-control-on-panel-shadow)] hover:border-[color:var(--theme-frosted-control-on-panel-hover-border)] hover:[background:var(--theme-frosted-control-on-panel-hover-bg)]",
    className,
  );
}

function RowContent({ active = false, title, subtitle, badge, leading, children }: EditorListRowSlots & { children?: ReactNode }) {
  return (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      {children ?? (
        <span className="min-w-0 flex-1 space-y-0.5">
          {title ? (
            <span
              className={cn(
                "block truncate text-sm font-medium",
                active ? "theme-accent-heading" : "theme-text-primary",
              )}
            >
              {title}
            </span>
          ) : null}
          {subtitle ? (
            <span className="theme-text-faint block truncate text-xs">{subtitle}</span>
          ) : null}
        </span>
      )}
      {badge ? <span className="shrink-0">{badge}</span> : null}
    </>
  );
}

export const EditorListItem = forwardRef<HTMLButtonElement, EditorListItemProps>(
  (
    { active = false, title, subtitle, badge, leading, onSelect, onClick, className, children, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      data-active={active || undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onSelect?.();
        }
      }}
      className={cn("theme-focus-ring", rowClassName(active, className))}
      {...props}
    >
      <RowContent active={active} title={title} subtitle={subtitle} badge={badge} leading={leading}>
        {children}
      </RowContent>
    </button>
  ),
);

EditorListItem.displayName = "EditorListItem";

export const EditorListRow = forwardRef<HTMLDivElement, EditorListRowProps>(
  ({ active = false, title, subtitle, badge, leading, className, children, ...props }, ref) => (
    <div ref={ref} data-active={active || undefined} className={rowClassName(active, className)} {...props}>
      <RowContent active={active} title={title} subtitle={subtitle} badge={badge} leading={leading}>
        {children}
      </RowContent>
    </div>
  ),
);

EditorListRow.displayName = "EditorListRow";
