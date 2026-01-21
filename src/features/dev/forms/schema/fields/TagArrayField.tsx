import { useState, useCallback, KeyboardEvent } from "react";
import { Icon } from "../../../../common/Icon";
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
    <div className="space-y-1.5">
      <label
        htmlFor={meta.path}
        className="block text-sm font-medium text-white/80"
      >
        {meta.label}
        {meta.required && <span className="ml-1 text-fuchsia-400">*</span>}
      </label>

      <div className="min-h-[42px] rounded-lg border border-white/10 bg-white/5 p-2 transition focus-within:border-fuchsia-500/50 focus-within:ring-1 focus-within:ring-fuchsia-500/50">
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2.5 py-1 text-xs font-medium text-fuchsia-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={disabled}
                className="rounded-full p-0.5 transition hover:bg-fuchsia-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Remove ${tag}`}
              >
                <Icon icon="lucide:x" className="h-3 w-3" size={12} />
              </button>
            </span>
          ))}
          <div className="flex min-w-[120px] flex-1 items-center gap-1">
            <input
              id={meta.path}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={value.length === 0 ? meta.placeholder : "Add more..."}
              disabled={disabled}
              className="min-w-0 flex-1 border-none bg-transparent px-1 py-0.5 text-[16px] text-white placeholder-white/40 focus:outline-none disabled:cursor-not-allowed"
            />
            {inputValue.trim() && (
              <button
                type="button"
                onClick={addTag}
                disabled={disabled}
                className="rounded-full p-1 text-fuchsia-300 transition hover:bg-fuchsia-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Add tag"
              >
                <Icon icon="lucide:plus" className="h-4 w-4" size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {meta.description && (
        <p className="text-xs text-white/50">{meta.description}</p>
      )}
    </div>
  );
}
