import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface EditorListRowSlots {
  active?: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Trailing slot (badge, count, status pill). */
  badge?: ReactNode;
  /** Leading slot (icon, avatar, drag handle). */
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
    "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
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

/**
 * Selectable queue/list row. Idle rows sit quietly on the panel; the active row
 * lights up through the nested --theme-frosted-control-on-panel-* tokens (with
 * a real visible state, fixing the inert data-active selection bug where the
 * previous markup styled an attribute that never resolved to a token). Renders
 * as a real <button> with the standard accent focus-visible ring, so keyboard
 * selection works. data-active is also reflected for any consumer CSS hooks.
 *
 * Use this for standalone rows. Inside an `EditorList` (a listbox that owns
 * focus and selection) render `EditorListRow` instead, so the list stays one
 * tab stop with no interactive element nested in an option.
 */
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

/**
 * Presentational twin of `EditorListItem` for `EditorList` rows: the same look,
 * but a plain element that takes no focus and carries no role, because the
 * surrounding `role="option"` wrapper owns the click and the listbox owns the
 * keyboard through aria-activedescendant.
 */
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
