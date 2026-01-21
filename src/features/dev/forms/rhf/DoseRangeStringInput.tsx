/**
 * String input component that internally works with DoseRange schema type.
 * Displays "10-20 mg" format but stores { min, max, unit }.
 */

import { useCallback, useState, type ChangeEvent, type FocusEvent } from "react";
import { Controller, useFormContext, type FieldPath, type ControllerRenderProps } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { doseRangeTransformer } from "@/data/schema";
import type { SubstanceArticle, DoseRange } from "@/schema";

type DoseRangeFieldPath = FieldPath<SubstanceArticle> & (
  | `dosage.routes.${number}.dose_ranges.threshold`
  | `dosage.routes.${number}.dose_ranges.light`
  | `dosage.routes.${number}.dose_ranges.moderate`
  | `dosage.routes.${number}.dose_ranges.strong`
  | `dosage.routes.${number}.dose_ranges.heavy`
);

export type DoseRangeStringInputProps = {
  name: DoseRangeFieldPath;
  placeholder?: string;
  className?: string;
};

/**
 * Inner component that safely uses hooks outside of Controller's render prop.
 */
function DoseRangeInnerInput({
  field,
  placeholder,
  className,
}: {
  field: ControllerRenderProps<SubstanceArticle, DoseRangeFieldPath>;
  placeholder: string;
  className?: string;
}) {
  // Local state for the string representation
  const [localValue, setLocalValue] = useState(() =>
    doseRangeTransformer.toForm(field.value)
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  }, []);

  const handleBlur = useCallback(
    (_event: FocusEvent<HTMLInputElement>) => {
      const parsed = doseRangeTransformer.toSchema(localValue);
      // Update the form with the parsed value, or reset to empty
      const schemaValue: DoseRange = parsed ?? { min: null, max: null, unit: "" };
      field.onChange(schemaValue);
      field.onBlur();
      // Re-format the display value
      setLocalValue(doseRangeTransformer.toForm(schemaValue));
    },
    [localValue, field]
  );

  return (
    <Input
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
}

export function DoseRangeStringInput({
  name,
  placeholder = "e.g., 10-20 mg",
  className,
}: DoseRangeStringInputProps) {
  const { control } = useFormContext<SubstanceArticle>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <DoseRangeInnerInput
          field={field}
          placeholder={placeholder}
          className={className}
        />
      )}
    />
  );
}
