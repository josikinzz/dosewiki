/**
 * Text list input for longer entries (like interactions).
 * Displays items as readable text cards instead of pills.
 */

import { useState, type KeyboardEvent } from "react";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";
import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EntryCard } from "@/features/dev/forms/EntryCard";
import type { SubstanceArticle } from "@/schema";

type ArrayFieldPath = FieldPath<SubstanceArticle> & (
  | "interactions.dangerous"
  | "interactions.unsafe"
  | "interactions.caution"
  | "tolerance.cross_tolerance"
  | "harm_potential.risks.other"
);

export type TextListInputProps = {
  name: ArrayFieldPath;
  label: string;
  helperText?: string;
  placeholder?: string;
  addButtonLabel?: string;
  /** Optional icon to display next to the label */
  icon?: React.ReactNode;
};

export function TextListInput({
  name,
  label,
  helperText,
  placeholder = "Enter text and press Enter or click Add",
  addButtonLabel = "Add",
  icon,
}: TextListInputProps) {
  const { control } = useFormContext<SubstanceArticle>();
  const [inputValue, setInputValue] = useState("");

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const values: string[] = field.value ?? [];

        const handleAdd = () => {
          const trimmed = inputValue.trim();
          if (!trimmed) return;
          if (values.includes(trimmed)) {
            setInputValue("");
            return;
          }
          field.onChange([...values, trimmed]);
          setInputValue("");
        };

        const handleRemove = (index: number) => {
          field.onChange(values.filter((_, i) => i !== index));
        };

        const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleAdd();
          }
        };

        return (
          <div className="space-y-3">
            <label className="theme-text-secondary flex items-center gap-1.5 text-sm font-medium">
              {icon}
              {label}
            </label>

            {/* Existing entries */}
            {values.length > 0 && (
              <div className="space-y-2">
                {values.map((item, index) => (
                  <EntryCard
                    key={`${name}-${index}`}
                    onRemove={() => handleRemove(index)}
                    removeLabel={`Remove entry ${index + 1}`}
                  >
                    <span className="theme-text-secondary block whitespace-pre-wrap text-sm leading-relaxed">
                      {item}
                    </span>
                  </EntryCard>
                ))}
              </div>
            )}

            {/* Add new entry */}
            <div className="flex gap-2">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                textareaSize="sm"
                className="flex-1 resize-none"
                rows={2}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-auto shrink-0 self-stretch"
                onClick={handleAdd}
                disabled={!inputValue.trim()}
                aria-label={addButtonLabel}
              >
                <Icon icon="lucide:plus" className="h-4 w-4" size={16} />
              </Button>
            </div>

            {helperText && (
              <p className="theme-text-faint text-xs">{helperText}</p>
            )}
          </div>
        );
      }}
    />
  );
}
