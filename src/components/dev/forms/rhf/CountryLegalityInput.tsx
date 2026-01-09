/**
 * Textarea input component for country legality records.
 * Displays multiline "Country | Status | Notes" format but stores as Record<string, { status, notes }>.
 */

import { useCallback, useState, type ChangeEvent, type FocusEvent } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { Textarea } from "@/components/ui/textarea";
import { countryLegalityTransformer } from "../../../../data/schema";
import type { SubstanceArticle } from "../../../../schema";

export type CountryLegalityInputProps = {
  placeholder?: string;
  className?: string;
  rows?: number;
};

export function CountryLegalityInput({
  placeholder = "Country | Status | Notes (one per line)",
  className,
  rows = 4,
}: CountryLegalityInputProps) {
  const { control } = useFormContext<SubstanceArticle>();

  return (
    <Controller
      name="legality.countries"
      control={control}
      render={({ field }) => {
        // Local state for the string representation
        const [localValue, setLocalValue] = useState(() =>
          countryLegalityTransformer.toForm(field.value ?? {})
        );

        const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
          setLocalValue(e.target.value);
        }, []);

        const handleBlur = useCallback(
          (e: FocusEvent<HTMLTextAreaElement>) => {
            const parsed = countryLegalityTransformer.toSchema(localValue);
            field.onChange(parsed);
            field.onBlur();
            // Re-format the display value
            setLocalValue(countryLegalityTransformer.toForm(parsed));
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
      }}
    />
  );
}
