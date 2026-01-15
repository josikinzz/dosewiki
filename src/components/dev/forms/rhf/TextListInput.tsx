/**
 * Text list input for longer entries (like interactions).
 * Displays items as readable text cards instead of pills.
 */

import { useState, type KeyboardEvent } from "react";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";
import { Icon } from "../../../common/Icon";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SubstanceArticle } from "../../../../schema";

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
            <label className="flex items-center gap-1.5 text-sm font-medium text-white/80">
              {icon}
              {label}
            </label>
            
            {/* Existing entries */}
            {values.length > 0 && (
              <div className="space-y-2">
                {values.map((item, index) => (
                  <div
                    key={`${name}-${index}`}
                    className="group relative rounded-lg border border-white/10 bg-slate-900/50 p-3 pr-10 text-sm leading-relaxed text-white/85 transition hover:border-white/15 hover:bg-slate-900/70"
                  >
                    <span className="whitespace-pre-wrap">{item}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-6 w-6 opacity-50 transition hover:opacity-100"
                      onClick={() => handleRemove(index)}
                      aria-label={`Remove entry ${index + 1}`}
                    >
                      <Icon icon="lucide:x" className="h-4 w-4" size={16} />
                    </Button>
                  </div>
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
                className="min-h-[60px] flex-1 resize-none text-sm"
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
              <p className="text-xs text-white/50">{helperText}</p>
            )}
          </div>
        );
      }}
    />
  );
}
