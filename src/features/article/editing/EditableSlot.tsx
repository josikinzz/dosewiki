"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useArticleEdit, type EditableValueInput } from "./ArticleEditContext";
import { EditableValue } from "./EditableValue";
import type { MessageValues } from "@/i18n/messages";

interface EditableSlotProps<T extends EditableValueInput = string> {
  /** Concrete article field path, e.g. `legality.countries.Germany.notes`. */
  path: string;
  /** The RAW stored value — usually empty, which is why the row is missing. */
  value: T;
  /** Prompt shown in place of the absent content, e.g. "Add a country note". */
  emptyLabel: string;
  /** Human name for the field, used in the accessible label. */
  label?: string;
  labelValues?: MessageValues;
  /** See `EditableValue`; a range slot supplies both. */
  format?: (value: T) => string;
  parse?: (raw: string) => T | null;
  parseErrorLabel?: string;
  as?: "span" | "div";
  className?: string;
  /**
   * What to render once the field has a value. Optional: most slots exist
   * precisely because the call site renders nothing at all when the value is
   * empty, and the real render takes over as soon as it is not.
   */
  children?: ReactNode;
}

/**
 * The empty-field affordance for call sites that render no container at all.
 *
 * `EditableValue` can only offer a placeholder where the call site already
 * draws something. A whole row, card, or subsection that disappears when its
 * value is empty leaves no hook to hang an editor on, so the missing note is
 * the one thing a reviewer can never fix from the page. This component is that
 * hook: it renders the placeholder itself.
 *
 * Outside an editing surface it renders nothing — not an empty wrapper, not a
 * fragment with whitespace — so the public article is byte-identical to what it
 * was before the slot was added. That property is the whole contract; put a
 * slot anywhere it is convenient without weighing what it does to the public
 * page, because the answer is always nothing.
 */
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
