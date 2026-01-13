/**
 * Textarea input component for Record<string, string> fields.
 * Displays multiline "key: value" format but stores as a Record object.
 */

import { useCallback, useState, type ChangeEvent, type FocusEvent } from "react";
import { Controller, useFormContext, type FieldPath, type ControllerRenderProps } from "react-hook-form";

import { Textarea } from "@/components/ui/textarea";
import { recordTransformer } from "../../../../data/schema";
import type { SubstanceArticle } from "../../../../schema";

type RecordFieldPath = FieldPath<SubstanceArticle> & (
  | "pharmacology.receptor_binding"
  | "reagent_testing"
);

export type RecordStringInputProps = {
  name: RecordFieldPath;
  placeholder?: string;
  className?: string;
  rows?: number;
};

/**
 * Inner component that safely uses hooks outside of Controller's render prop.
 */
function RecordInnerInput({
  field,
  placeholder,
  className,
  rows,
}: {
  field: ControllerRenderProps<SubstanceArticle, RecordFieldPath>;
  placeholder: string;
  className?: string;
  rows: number;
}) {
  // Local state for the string representation
  const [localValue, setLocalValue] = useState(() =>
    recordTransformer.toForm(field.value ?? {})
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
  }, []);

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLTextAreaElement>) => {
      const parsed = recordTransformer.toSchema(localValue);
      field.onChange(parsed);
      field.onBlur();
      // Re-format the display value
      setLocalValue(recordTransformer.toForm(parsed));
    },
    [localValue, field]
  );

  return (
    <Textarea
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      rows={rows}
    />
  );
}

export function RecordStringInput({
  name,
  placeholder = "key: value (one per line)",
  className,
  rows = 4,
}: RecordStringInputProps) {
  const { control } = useFormContext<SubstanceArticle>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <RecordInnerInput
          field={field}
          placeholder={placeholder}
          className={className}
          rows={rows}
        />
      )}
    />
  );
}
