/**
 * String input component that internally works with DoseRange schema type.
 * Displays "10-20 mg" format but stores { min, max, unit }.
 */

import { useCallback, useId, useState, type ChangeEvent, type FocusEvent } from "react";
import { Controller, useFormContext, type FieldPath, type ControllerRenderProps } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { doseRangeTransformer } from "@/data/schema";
import type { SubstanceArticle, DoseRange } from "@/schema";

/** Shown when the typed text is not a dose at all. */
const UNPARSEABLE_MESSAGE =
  "Not a dose range. Use a form like 10-20 mg, 10+ mg, ~10 mg, or <20 mg — or clear the field.";

type DoseRangeFieldPath = FieldPath<SubstanceArticle> & (
  | `dosage.routes.${number}.dose_ranges.threshold`
  | `dosage.routes.${number}.dose_ranges.light`
  | `dosage.routes.${number}.dose_ranges.moderate`
  | `dosage.routes.${number}.dose_ranges.strong`
  | `dosage.routes.${number}.dose_ranges.heavy`
);

export type DoseRangeStringInputProps = {
  id?: string;
  name: DoseRangeFieldPath;
  placeholder?: string;
  className?: string;
};

/**
 * Inner component that safely uses hooks outside of Controller's render prop.
 */
function DoseRangeInnerInput({
  id,
  field,
  placeholder,
  className,
}: {
  id?: string;
  field: ControllerRenderProps<SubstanceArticle, DoseRangeFieldPath>;
  placeholder: string;
  className?: string;
}) {
  // Keep only an in-flight edit locally; otherwise display the current form
  // value, including resets and paired-route operations.
  const [draft, setDraft] = useState<string | null>(null);
  const localValue = draft ?? doseRangeTransformer.toForm(field.value);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    setError(null);
    e.target.setCustomValidity("");
  }, []);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      if (draft === null || localValue === doseRangeTransformer.toForm(field.value)) {
        setDraft(null);
        field.onBlur();
        return;
      }
      const parsed = doseRangeTransformer.toSchema(localValue);

      if (!parsed) {
        // An empty field is a deliberate clear; anything else is a typo, and
        // writing the empty range for it would silently destroy a stored dose
        // that nobody meant to touch. Surface it and leave the value alone —
        // the typed text stays on screen so the correction is one keystroke.
        if (localValue.trim() === "") {
          const cleared: DoseRange = { ...field.value, min: null, max: null, unit: "" };
          setError(null);
          field.onChange(cleared);
          field.onBlur();
          setDraft(null);
          return;
        }
        setError(UNPARSEABLE_MESSAGE);
        event.target.setCustomValidity(UNPARSEABLE_MESSAGE);
        // Touched state still advances; only the value is withheld.
        field.onBlur();
        return;
      }
      if (parsed.min != null && parsed.max != null && parsed.min > parsed.max) {
        const message = "The minimum must not exceed the maximum. Correct the range bounds.";
        setError(message);
        event.target.setCustomValidity(message);
        field.onBlur();
        return;
      }

      setError(null);
      field.onChange({ ...field.value, ...parsed });
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

export function DoseRangeStringInput({
  id,
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
          id={id}
          field={field}
          placeholder={placeholder}
          className={className}
        />
      )}
    />
  );
}
