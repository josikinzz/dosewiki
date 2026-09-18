import { useId, useState, type KeyboardEvent } from "react";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagToken } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";

export type ReferenceIdListInputProps = {
  name: FieldPath<SubstanceArticle>;
  label: string;
  helperText?: string;
  placeholder?: string;
};

export function ReferenceIdListInput({
  name,
  label,
  helperText,
  placeholder = "Add stable reference id",
}: ReferenceIdListInputProps) {
  const { control } = useFormContext<SubstanceArticle>();
  const [inputValue, setInputValue] = useState("");
  const inputId = useId();
  const helperId = `${inputId}-help`;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const values: string[] = Array.isArray(field.value) ? field.value : [];

        const addValue = () => {
          const trimmed = inputValue.trim();
          if (!trimmed || values.includes(trimmed)) {
            setInputValue("");
            return;
          }
          field.onChange([...values, trimmed]);
          setInputValue("");
        };

        const removeValue = (value: string) => {
          field.onChange(values.filter((entry) => entry !== value));
        };

        const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addValue();
          }
        };

        return (
          <div className="space-y-2">
            <label htmlFor={inputId} className="theme-text-secondary text-sm font-medium">{label}</label>
            {values.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {values.map((value) => (
                  <TagToken
                    key={`${String(name)}-${value}`}
                    label={value}
                    variant="compact"
                    onRemove={() => removeValue(value)}
                    removeLabel={`Remove ${value}`}
                  />
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Input
                id={inputId}
                aria-describedby={helperText ? helperId : undefined}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
              />
              <Button type="button" variant="outline" size="icon" onClick={addValue} disabled={!inputValue.trim()} aria-label={`Add ${label}`}>
                <Icon icon="lucide:plus" size={16} className="h-4 w-4" />
              </Button>
            </div>
            {helperText ? <p id={helperId} className="theme-text-faint text-xs">{helperText}</p> : null}
          </div>
        );
      }}
    />
  );
}
