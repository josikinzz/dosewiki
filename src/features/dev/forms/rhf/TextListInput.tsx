/** Text-list authoring for article notes and longer entries. */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EntryCard } from "@/features/dev/forms/EntryCard";
import type { SubstanceArticle } from "@/schema";

type ArrayFieldPath = FieldPath<SubstanceArticle> & (
  | "interactions.dangerous"
  | "interactions.unsafe"
  | "interactions.caution"
  | "tolerance.cross_tolerance"
  | "harm_potential.risks.other"
  | "legality.international"
);

export type TextListInputProps = {
  name: ArrayFieldPath;
  label: string;
  helperText?: string;
  placeholder?: string;
  addButtonLabel?: string;
  /** Inline correction and feedback for embedded article editing. */
  embedded?: boolean;
  icon?: React.ReactNode;
};

export function TextListInput({
  name,
  label,
  helperText,
  placeholder = "Enter text and press Enter or click Add",
  addButtonLabel = "Add",
  icon,
  embedded = false,
}: TextListInputProps) {
  const { control } = useFormContext<SubstanceArticle>();
  const [inputValue, setInputValue] = useState("");
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  const [inputError, setInputError] = useState("");
  const [editError, setEditError] = useState("");
  const [status, setStatus] = useState("");
  const [removed, setRemoved] = useState<{ index: number; value: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editingRef = useRef<HTMLTextAreaElement>(null);
  const editingIndex = editing?.index;
  useEffect(() => {
    if (editingIndex !== undefined) editingRef.current?.focus();
  }, [editingIndex]);
  const inputId = useId();
  const helperId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const editErrorId = `${inputId}-edit-error`;
  const focusEdit = (index: number) => {
    requestAnimationFrame(() => document.getElementById(`${inputId}-edit-${index}`)?.focus());
  };

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
            if (embedded) {
              setInputError("This entry already exists. Edit the existing entry or change this text.");
              inputRef.current?.focus();
            } else {
              setInputValue("");
            }
            return;
          }
          field.onChange([...values, trimmed]);
          setInputValue("");
          setInputError("");
          if (embedded) {
            setStatus("Entry added.");
            inputRef.current?.focus();
          }
        };
        const handleRemove = (index: number) => {
          if (embedded) {
            setRemoved({ index, value: values[index] });
            setStatus("Entry removed. You can undo this removal.");
            inputRef.current?.focus();
          }
          field.onChange(values.filter((_, i) => i !== index));
        };
        const saveEdit = () => {
          if (!editing) return;
          const trimmed = editing.value.trim();
          if (!trimmed) {
            setEditError("Enter text, or cancel to keep the existing entry.");
            return;
          }
          if (values.some((value, index) => index !== editing.index && value === trimmed)) {
            setEditError("This entry already exists. Change this text or cancel.");
            return;
          }
          field.onChange(values.map((value, index) => index === editing.index ? trimmed : value));
          setStatus("Entry updated.");
          setEditError("");
          focusEdit(editing.index);
          setEditing(null);
        };
        const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            handleAdd();
          }
        };

        return (
          <div className="space-y-3">
            <label htmlFor={inputId} className="theme-text-secondary flex items-center gap-1.5 text-sm font-medium">
              {icon}
              {label}
            </label>
            {values.length > 0 && (
              <div className="space-y-2">
                {values.map((item, index) => (
                  <EntryCard
                    key={`${name}-${index}`}
                  >
                    {embedded && editing?.index === index ? (
                      <div className="space-y-3">
                        <label htmlFor={`${inputId}-editing`} className="theme-text-secondary text-sm font-medium">
                          Edit {label.toLowerCase()} entry {index + 1}
                        </label>
                        <Textarea
                          id={`${inputId}-editing`}
                          ref={editingRef}
                          value={editing.value}
                          onChange={(event) => {
                            setEditing({ index, value: event.target.value });
                            setEditError("");
                          }}
                          aria-invalid={Boolean(editError)}
                          aria-describedby={editError ? editErrorId : undefined}
                          textareaSize="sm"
                          rows={3}
                        />
                        {editError && <p id={editErrorId} role="alert" className="theme-danger-text text-sm">{editError}</p>}
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" onClick={saveEdit}>Save entry</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => {
                            setEditing(null);
                            setEditError("");
                            focusEdit(index);
                          }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <span className="theme-text-secondary block min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed">
                          {item}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          {embedded && (
                            <Button type="button" id={`${inputId}-edit-${index}`} size="sm" variant="outline" disabled={editing !== null} aria-label={`Edit ${label.toLowerCase()} entry ${index + 1}`} onClick={() => {
                              setEditing({ index, value: item });
                              setEditError("");
                            }}>Edit</Button>
                          )}
                          <Button
                            type="button"
                            size="auto"
                            variant="ghost"
                            className={`h-8 w-8 shrink-0 ${TOUCH_ICON}`}
                            disabled={embedded && editing !== null}
                            title={`Remove ${label.toLowerCase()} entry ${index + 1}`}
                            aria-label={embedded ? `Remove ${label.toLowerCase()} entry ${index + 1}` : `Remove entry ${index + 1}`}
                            onClick={() => handleRemove(index)}
                          >
                            <Icon icon="lucide:trash-2" size={16} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </EntryCard>
                ))}
              </div>
            )}
            {embedded && (
              <div className="flex flex-wrap items-center gap-2">
                <p role="status" className="theme-text-muted text-sm">{status}</p>
                {removed && (
                  <Button type="button" variant="outline" size="sm" disabled={editing !== null} onClick={() => {
                    if (!values.includes(removed.value)) {
                      const restored = [...values];
                      restored.splice(Math.min(removed.index, values.length), 0, removed.value);
                      field.onChange(restored);
                    }
                    setRemoved(null);
                    setStatus("Entry restored.");
                    inputRef.current?.focus();
                  }}>Undo removal</Button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                id={inputId}
                ref={inputRef}
                aria-describedby={[helperText ? helperId : "", inputError ? errorId : ""].filter(Boolean).join(" ") || undefined}
                aria-invalid={Boolean(inputError)}
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  setInputError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                textareaSize="sm"
                className="flex-1 resize-none"
                rows={2}
              />
              <Button
                type="button"
                variant="outline"
                size={embedded ? "sm" : "icon"}
                className={embedded ? "shrink-0 self-end" : "h-auto shrink-0 self-stretch"}
                onClick={handleAdd}
                disabled={!inputValue.trim()}
                aria-label={addButtonLabel}
              >
                <Icon icon="lucide:plus" className="h-4 w-4" size={16} />
                {embedded && "Add"}
              </Button>
            </div>
            {inputError && <p id={errorId} role="alert" className="theme-danger-text text-sm">{inputError}</p>}
            {helperText && <p id={helperId} className="theme-text-faint text-xs">{helperText}</p>}
          </div>
        );
      }}
    />
  );
}
