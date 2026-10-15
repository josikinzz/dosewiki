"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useArticleEdit, type EditableValueInput } from "./ArticleEditContext";
import { EditableValue } from "./EditableValue";
import type { MessageValues } from "@/i18n/messages";

interface EditableSlotProps<T extends EditableValueInput = string> {
  path: string;
  value: T;
  emptyLabel: string;
  label?: string;
  labelValues?: MessageValues;
  format?: (value: T) => string;
  parse?: (raw: string) => T | null;
  parseErrorLabel?: string;
  as?: "span" | "div";
  className?: string;
  children?: ReactNode;
}

export function EditableSlot<T extends EditableValueInput = string>({
  path,
  value,
  emptyLabel,
  label,
  labelValues,
  format,
  parse,
  parseErrorLabel,
  as = "div",
  className,
  children,
}: EditableSlotProps<T>) {
  const editing = useArticleEdit();
  if (!editing) return null;

  return (
    <EditableValue
      as={as}
      className={cn("theme-text-faint text-sm leading-relaxed", className)}
      emptyLabel={emptyLabel}
      format={format}
      label={label ?? emptyLabel}
      labelValues={labelValues}
      parse={parse}
      parseErrorLabel={parseErrorLabel}
      path={path}
      value={value}
    >
      {children}
    </EditableValue>
  );
}
