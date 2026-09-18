import type { ReactNode, SelectHTMLAttributes } from "react";
import { forwardRef } from "react";
import { Icon } from "@/components/common/Icon";
import { TOUCH_PILL } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";

export interface EditorSelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface EditorSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Visual state. `error` swaps to the danger border/ring recipe. */
  variant?: "default" | "error";
  selectSize?: "default" | "sm";
  /**
   * Convenience option list. Children still render normally if supplied; pass
   * a `placeholder` to add a leading disabled option.
   */
  options?: EditorSelectOption[];
  placeholder?: string;
}

const selectSizeClasses: Record<NonNullable<EditorSelectProps["selectSize"]>, string> = {
  default: `h-11 px-3 py-2 pr-10 text-[16px] md:text-sm ${TOUCH_PILL}`,
  sm: `h-10 px-3 py-2 pr-9 text-[16px] md:text-sm ${TOUCH_PILL}`,
};

const selectVariantClasses: Record<NonNullable<EditorSelectProps["variant"]>, string> = {
  default:
    "theme-field-focus border-[var(--theme-border-subtle)]",
  error:
    "border-[color:var(--theme-danger-border)] focus:border-[color:var(--theme-danger-border-strong)]",
};

/**
 * Themed native `<select>` built on the shared Input recipe: appearance-none
 * with a chevron overlay, --theme-field-surface fill, --theme-border-subtle
 * rim, neutral focus border, and --theme-menu-surface
 * option backgrounds (so the popped list reads as a frosted menu, never a
 * baked slate hex). Reverso-safe in both themes.
 */
export const EditorSelect = forwardRef<HTMLSelectElement, EditorSelectProps>(
  (
    {
      variant = "default",
      selectSize = "default",
      options,
      placeholder,
      className,
      children,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const resolvedVariant =
      variant === "error" || ariaInvalid === true || ariaInvalid === "true"
        ? "error"
        : "default";

    return (
      <div className="relative w-full">
        <select
          ref={ref}
          aria-invalid={ariaInvalid}
          className={cn(
            "flex w-full appearance-none rounded-xl border bg-[var(--theme-field-surface)] text-[var(--theme-text-primary)] shadow-[var(--theme-elevation-field-inset)] transition",
            "focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            "[&>option]:bg-[var(--theme-menu-surface)] [&>option]:text-[var(--theme-text-primary)]",
            selectSizeClasses[selectSize],
            selectVariantClasses[resolvedVariant],
            className,
          )}
          {...props}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options
            ? options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))
            : children}
        </select>
        <Icon
          icon="lucide:chevron-down"
          size={16}
          className="theme-text-faint pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
        />
      </div>
    );
  },
);

EditorSelect.displayName = "EditorSelect";
