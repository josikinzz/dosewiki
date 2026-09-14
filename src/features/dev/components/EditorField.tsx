import type { HTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

interface EditorFieldControlProps { id: string;
"aria-describedby"?: string;
"aria-invalid"?: true; }

export interface EditorFieldProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  id?: string;
  htmlFor?: string;
  label?: ReactNode;
  required?: boolean;
  description?: ReactNode;
  error?: ReactNode;
  counter?: ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
  describedBy?: string;
  errorLive?: boolean;
  children?: ReactNode | ((controlProps: EditorFieldControlProps) => ReactNode);
}

const labelToneClasses = {
  default: "theme-text-muted",
  danger: "text-[color:var(--theme-danger-text)]",
  warning: "text-[color:var(--theme-warning-text)]",
  success: "text-[color:var(--theme-success-text)]",
};

export function EditorField({
  id,
  htmlFor,
  label,
  required,
  description,
  error,
  counter,
  tone = "default",
  describedBy,
  errorLive = false,
  className,
  children,
  ...props
}: EditorFieldProps) {
  const generatedId = useId();
  const controlId = htmlFor ?? id ?? `editor-field-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const counterId = counter ? `${controlId}-counter` : undefined;
  const computedDescribedBy = [
    describedBy,
    descriptionId,
    counterId,
    errorId,
  ]
    .filter(Boolean)
    .join(" ");
  const hasError = Boolean(error);
  const controlProps: EditorFieldControlProps = {
    id: controlId,
    "aria-describedby": computedDescribedBy || undefined,
    "aria-invalid": hasError ? true : undefined,
  };
  const resolvedTone = hasError ? "danger" : tone;

  return (
    <div className={cn("space-y-2", className)} {...props}>
      {(label || counter) ? (
        <div className="flex items-start justify-between gap-3">
          {label ? (
            <label
              htmlFor={controlId}
              className={cn(
                "block text-sm font-medium leading-5",
                labelToneClasses[resolvedTone],
              )}
            >
              {label}
              {required ? (
                <span className="theme-accent-emphasis ml-1" aria-hidden="true">
                  *
                </span>
              ) : null}
            </label>
          ) : null}
          {counter ? (
            <span
              id={counterId}
              className={cn(
                "shrink-0 text-xs tabular-nums",
                hasError
                  ? "text-[color:var(--theme-danger-text)]"
                  : "theme-text-faint",
              )}
            >
              {counter}
            </span>
          ) : null}
        </div>
      ) : null}

      {typeof children === "function" ? children(controlProps) : children}

      {description ? (
        <p id={descriptionId} className="theme-text-faint text-xs leading-5">
          {description}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="text-xs leading-5 text-[color:var(--theme-danger-text)]"
          role={errorLive ? "alert" : undefined}
          aria-live={errorLive ? "polite" : undefined}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface EditorFieldRowProps extends HTMLAttributes<HTMLDivElement> {
  layout?: "single" | "twoColumn" | "threeColumn" | "actionTrailing";
}

const fieldRowLayoutClasses: Record<NonNullable<EditorFieldRowProps["layout"]>, string> = {
  single: "grid gap-4",
  twoColumn: "grid gap-4 md:grid-cols-2",
  threeColumn: "grid gap-4 md:grid-cols-3",
  actionTrailing: "grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end",
};

export function EditorFieldRow({
  layout = "single",
  className,
  ...props
}: EditorFieldRowProps) {
  return (
    <div
      className={cn(fieldRowLayoutClasses[layout], className)}
      {...props}
    />
  );
}
