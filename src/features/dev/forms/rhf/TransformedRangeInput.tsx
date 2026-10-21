import { useCallback, useId, useState, type ChangeEvent, type FocusEvent } from "react";
import { Controller, useFormContext, type ControllerRenderProps, type FieldPath } from "react-hook-form";

import { Input } from "@/components/ui/input";
import type { Transformer } from "@/data/schema/types";
import type { DoseRange, SubstanceArticle } from "@/schema";

export type DoseRangeFieldPath = FieldPath<SubstanceArticle> & (
  | `dosage.routes.${number}.dose_ranges.threshold`
  | `dosage.routes.${number}.dose_ranges.light`
  | `dosage.routes.${number}.dose_ranges.moderate`
  | `dosage.routes.${number}.dose_ranges.strong`
  | `dosage.routes.${number}.dose_ranges.heavy`
);

export type DurationStageFieldPath = FieldPath<SubstanceArticle> & (
  | `duration.routes.${number}.stages.onset`
  | `duration.routes.${number}.stages.come_up`
  | `duration.routes.${number}.stages.peak`
  | `duration.routes.${number}.stages.offset`
  | `duration.routes.${number}.stages.after_effects`
  | `duration.routes.${number}.stages.total_duration`
);

type RangeFieldPath = DoseRangeFieldPath | DurationStageFieldPath;

const CLEARED_RANGE: DoseRange = { min: null, max: null, unit: "" };
const REVERSED_RANGE_MESSAGE = "The minimum must not exceed the maximum. Correct the range bounds.";

export type TransformedRangeInputProps = {
  id?: string;
  name: RangeFieldPath;
  placeholder: string;
  className?: string;
  transformer: Transformer<DoseRange | null, string>;
  unparseableMessage: string;
};

function RangeTextInput({
  id,
  field,
  placeholder,
  className,
  transformer,
  unparseableMessage,
}: Omit<TransformedRangeInputProps, "name"> & {
  field: ControllerRenderProps<SubstanceArticle, RangeFieldPath>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const localValue = draft ?? transformer.toForm(field.value);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    setError(null);
    e.target.setCustomValidity("");
  }, []);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      if (draft === null || localValue === transformer.toForm(field.value)) {
        setDraft(null);
        field.onBlur();
        return;
      }
      const parsed = transformer.toSchema(localValue);
      const refusal =
        !parsed && localValue.trim() !== "" ? unparseableMessage
        : parsed?.min != null && parsed.max != null && parsed.min > parsed.max ? REVERSED_RANGE_MESSAGE
        : null;
      if (refusal) {
        setError(refusal);
        event.target.setCustomValidity(refusal);
        field.onBlur();
        return;
      }
      setError(null);
      field.onChange({ ...field.value, ...(parsed ?? CLEARED_RANGE) });
      field.onBlur();
      setDraft(null);
    },
    [draft, localValue, field, transformer, unparseableMessage]
  );

  return (
    <>
      <Input
        id={id}
        name={field.name}
        ref={field.ref}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} role="alert" className="theme-danger-text mt-1 text-xs leading-tight">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function TransformedRangeInput({ name, ...props }: TransformedRangeInputProps) {
  const { control } = useFormContext<SubstanceArticle>();

  return <Controller name={name} control={control} render={({ field }) => <RangeTextInput field={field} {...props} />} />;
}
