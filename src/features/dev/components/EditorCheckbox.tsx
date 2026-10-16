import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface EditorCheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  description?: ReactNode;
  tone?: "default" | "danger";
  containerClassName?: string;
}

const checkboxToneClasses: Record<NonNullable<EditorCheckboxProps["tone"]>, string> = {
  default: "accent-[var(--theme-accent-strong)]",
  danger: "accent-[color:var(--theme-danger-text)]",
};

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
