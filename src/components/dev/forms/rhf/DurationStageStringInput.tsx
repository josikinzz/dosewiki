/**
 * String input component that internally works with DurationStage schema type.
 * Displays "15-30 minutes" format but stores { min, max, unit }.
 */

import { useCallback, useState, type ChangeEvent, type FocusEvent } from "react";
import { Controller, useFormContext, type FieldPath, type ControllerRenderProps } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { durationStageTransformer } from "../../../../data/schema";
import type { SubstanceArticle, DurationStage } from "../../../../schema";

type DurationStageFieldPath = FieldPath<SubstanceArticle> & (
  | `duration.routes.${number}.stages.onset`
  | `duration.routes.${number}.stages.come_up`
  | `duration.routes.${number}.stages.peak`
  | `duration.routes.${number}.stages.offset`
  | `duration.routes.${number}.stages.after_effects`
  | `duration.routes.${number}.stages.total_duration`
);

export type DurationStageStringInputProps = {
  name: DurationStageFieldPath;
  placeholder?: string;
  className?: string;
};

/**
 * Inner component that safely uses hooks outside of Controller's render prop.
 */
function DurationStageInnerInput({
  field,
  placeholder,
  className,
}: {
  field: ControllerRenderProps<SubstanceArticle, DurationStageFieldPath>;
  placeholder: string;
  className?: string;
}) {
  // Local state for the string representation
  const [localValue, setLocalValue] = useState(() =>
    durationStageTransformer.toForm(field.value)
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  }, []);

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      const parsed = durationStageTransformer.toSchema(localValue);
      // Update the form with the parsed value, or reset to empty
      const schemaValue: DurationStage = parsed ?? { min: null, max: null, unit: "" };
      field.onChange(schemaValue);
      field.onBlur();
      // Re-format the display value
      setLocalValue(durationStageTransformer.toForm(schemaValue));
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

export function DurationStageStringInput({
  name,
  placeholder = "e.g., 15-30 minutes",
  className,
}: DurationStageStringInputProps) {
  const { control } = useFormContext<SubstanceArticle>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <DurationStageInnerInput
          field={field}
          placeholder={placeholder}
          className={className}
        />
      )}
    />
  );
}
