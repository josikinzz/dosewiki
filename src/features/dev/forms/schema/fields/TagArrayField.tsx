import { useState, useCallback, KeyboardEvent } from "react";
import { Icon } from "@/components/common/Icon";
import { EditorField, TagToken } from "@/features/dev/components";
import type { FieldMeta } from "@/data/schema";

interface TagArrayFieldProps {
  meta: FieldMeta;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function TagArrayField({
  meta,
  value,
  onChange,
  disabled,
}: TagArrayFieldProps) {
  const [inputValue, setInputValue] = useState("");

  const addTag = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setInputValue("");
    }
  }, [inputValue, value, onChange]);

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onChange(value.filter((tag) => tag !== tagToRemove));
    },
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
        removeTag(value[value.length - 1]);
      }
    },
    [addTag, inputValue, value, removeTag]
  );

  return (
    <EditorField
      id={meta.path}
      label={meta.label}
      required={meta.required}
      description={meta.description}
    >
      {(fieldProps) => (
        <div className="min-h-[42px] rounded-lg border border-[color:var(--editor-field-border)] bg-[var(--editor-field-bg)] p-2 transition focus-within:border-[color:var(--editor-field-focus)] focus-within:ring-1 focus-within:ring-[color:var(--editor-field-focus)]">
          <div className="flex flex-wrap gap-1.5">
            {value.map((tag) => (
              <TagToken
                key={tag}
                label={tag}
                variant="interactive"
                disabled={disabled}
                onRemove={() => removeTag(tag)}
              />
            ))}
            <div className="flex min-w-[120px] flex-1 items-center gap-1">
              <input
                {...fieldProps}
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={value.length === 0 ? meta.placeholder : "Add more..."}
                disabled={disabled}
                className="theme-text-primary min-w-0 flex-1 border-none bg-transparent px-1 py-0.5 text-[16px] focus:outline-none disabled:cursor-not-allowed"
              />
              {inputValue.trim() ? (
                <button
                  type="button"
                  onClick={addTag}
                  disabled={disabled}
                  className="theme-accent-emphasis rounded-full p-1 transition hover:bg-[var(--editor-chip-bg)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Add tag"
                >
                  <Icon icon="lucide:plus" className="h-4 w-4" size={16} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </EditorField>
  );
}
