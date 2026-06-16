import { useState, type KeyboardEvent } from "react";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
            <label className="text-sm font-medium text-white/80">{label}</label>
            <div className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,#fff_3%,var(--theme-panel-base))] p-2">
              <div className="flex flex-wrap gap-1.5">
                {values.map((value) => (
                  <span
                    key={`${String(name)}-${value}`}
                    className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,#d946ef_15%,var(--theme-control-base))] px-2.5 py-1 text-xs text-fuchsia-100"
                  >
                    {value}
                    <button
                      type="button"
                      onClick={() => removeValue(value)}
                      className="rounded-full p-0.5 text-fuchsia-100/75 transition hover:bg-[color-mix(in_srgb,#d946ef_25%,var(--theme-control-base))] hover:text-white"
                      aria-label={`Remove ${value}`}
                    >
                      <Icon icon="lucide:x" size={12} className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                />
                <Button type="button" variant="outline" size="icon" onClick={addValue} disabled={!inputValue.trim()}>
                  <Icon icon="lucide:plus" size={16} className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {helperText ? <p className="text-xs text-white/45">{helperText}</p> : null}
          </div>
        );
      }}
    />
  );
}
