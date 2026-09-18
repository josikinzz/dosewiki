/**
 * String input component that internally works with DurationStage schema type.
 * Displays "15-30 minutes" format but stores { min, max, unit }.
 */

import { useCallback, useId, useState, type ChangeEvent, type FocusEvent } from "react";
import { Controller, useFormContext, type FieldPath, type ControllerRenderProps } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { durationStageTransformer } from "@/data/schema";
import type { SubstanceArticle, DurationStage } from "@/schema";

type DurationStageFieldPath = FieldPath<SubstanceArticle> & (
  | `duration.routes.${number}.stages.onset`
  | `duration.routes.${number}.stages.come_up`
  | `duration.routes.${number}.stages.peak`
  | `duration.routes.${number}.stages.offset`
  | `duration.routes.${number}.stages.after_effects`
  | `duration.routes.${number}.stages.total_duration`
);

export type DurationStageStringInputProps = {
  id?: string;
  name: DurationStageFieldPath;
  placeholder?: string;
  className?: string;
};

/**
 * Inner component that safely uses hooks outside of Controller's render prop.
 */
function DurationStageInnerInput({
  id,
  field,
  placeholder,
  className,
}: {
  id?: string;
  field: ControllerRenderProps<SubstanceArticle, DurationStageFieldPath>;
  placeholder: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const localValue = draft ?? durationStageTransformer.toForm(field.value);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    setError(null);
    e.target.setCustomValidity("");
  }, []);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      if (draft === null || localValue === durationStageTransformer.toForm(field.value)) {
        setDraft(null);
        field.onBlur();
        return;
      }
      const parsed = durationStageTransformer.toSchema(localValue);
      if (!parsed && localValue.trim() !== "") {
        setError("Not a duration range. Use a form like 15-30 minutes, or clear the field.");
        event.target.setCustomValidity("Not a duration range. Use a form like 15-30 minutes, or clear the field.");
        field.onBlur();
        return;
      }
      if (parsed?.min != null && parsed.max != null && parsed.min > parsed.max) {
        const message = "The minimum must not exceed the maximum. Correct the range bounds.";
        setError(message);
        event.target.setCustomValidity(message);
        field.onBlur();
        return;
      }
      const schemaValue: DurationStage = {
        ...field.value,
        ...(parsed ?? { min: null, max: null, unit: "" }),
      };
      setError(null);
      field.onChange(schemaValue);
      field.onBlur();
      setDraft(null);
    },
    [draft, localValue, field]
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

export function DurationStageStringInput({
  id,
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
          id={id}
          field={field}
          placeholder={placeholder}
          className={className}
        />
      )}
    />
  );
}
