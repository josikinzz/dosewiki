import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface EditorCheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  description?: ReactNode;
  /** `danger` tints the checked accent toward the semantic danger token. */
  tone?: "default" | "danger";
  /** Wrapper class (the label row); use `className` for the input itself. */
  containerClassName?: string;
}

const checkboxToneClasses: Record<NonNullable<EditorCheckboxProps["tone"]>, string> = {
  // accent-color drives the checked fill; ring-soft drives the focus halo.
  default: "accent-[var(--theme-accent-strong)]",
  danger: "accent-[color:var(--theme-danger-text)]",
};

/**
 * Themed checkbox: --theme-field-surface fill, --theme-border-subtle rim, a
 * checked accent driven by accent-color (--theme-accent-strong, or the danger
 * token for tone="danger"), and a --theme-ring-soft focus-visible ring. No raw
 * white/fuchsia opacity, no baked navy hex — reverso-safe in both themes.
 */
export const EditorCheckbox = forwardRef<HTMLInputElement, EditorCheckboxProps>(
  (
    { label, description, tone = "default", id, className, containerClassName, ...props },
    ref,
  ) => {
    const generatedId = useId();
    const controlId = id ?? `editor-checkbox-${generatedId}`;
    const descriptionId = description ? `${controlId}-description` : undefined;

    const input = (
      <input
        ref={ref}
        id={controlId}
        type="checkbox"
        aria-describedby={descriptionId}
        className={cn(
          "size-4 shrink-0 cursor-pointer rounded border border-[var(--theme-border-subtle)] bg-[var(--theme-field-surface)]",
          "transition theme-focus-ring-tight",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checkboxToneClasses[tone],
          className,
        )}
        {...props}
      />
    );

    if (!label && !description) {
      return input;
    }

    return (
      <div className={cn("flex items-start gap-2.5", containerClassName)}>
        {input}
        <div className="min-w-0 space-y-0.5">
          {label ? (
            <label
              htmlFor={controlId}
              className={cn(
                "block cursor-pointer text-sm leading-5",
                tone === "danger"
                  ? "text-[color:var(--theme-danger-text)]"
                  : "theme-text-secondary",
              )}
            >
              {label}
            </label>
          ) : null}
          {description ? (
            <p id={descriptionId} className="theme-text-faint text-xs leading-5">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    );
  },
);

EditorCheckbox.displayName = "EditorCheckbox";
