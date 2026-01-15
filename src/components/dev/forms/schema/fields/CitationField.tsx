import { useState, useCallback } from "react";
import { Icon } from "../../../../common/Icon";
import type { FieldMeta, Citation } from "@/data/schema";

interface CitationFieldProps {
  meta: FieldMeta;
  value: Citation[];
  onChange: (value: Citation[]) => void;
  disabled?: boolean;
}

export function CitationField({
  meta,
  value,
  onChange,
  disabled,
}: CitationFieldProps) {
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const addCitation = useCallback(() => {
    const trimmedName = newName.trim();
    const trimmedUrl = newUrl.trim();

    if (trimmedName || trimmedUrl) {
      onChange([...value, { name: trimmedName, url: trimmedUrl }]);
      setNewName("");
      setNewUrl("");
    }
  }, [newName, newUrl, value, onChange]);

  const removeCitation = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  const updateCitation = useCallback(
    (index: number, field: "name" | "url", newValue: string) => {
      const updated = [...value];
      updated[index] = { ...updated[index], [field]: newValue };
      onChange(updated);
    },
    [value, onChange]
  );

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-white/80">
        {meta.label}
        {meta.required && <span className="ml-1 text-fuchsia-400">*</span>}
      </label>

      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((citation, index) => (
            <div
              key={index}
              className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2"
            >
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={citation.name}
                  onChange={(e) => updateCitation(index, "name", e.target.value)}
                  placeholder="Citation name"
                  disabled={disabled}
                  className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={citation.url}
                    onChange={(e) => updateCitation(index, "url", e.target.value)}
                    placeholder="URL"
                    disabled={disabled}
                    className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {citation.url && (
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-fuchsia-300 transition hover:text-fuchsia-200"
                      aria-label="Open URL"
                    >
                      <Icon icon="lucide:external-link" className="h-4 w-4" size={16} />
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeCitation(index)}
                disabled={disabled}
                className="rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Remove citation"
              >
                <Icon icon="lucide:x" className="h-4 w-4" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-lg border border-dashed border-white/20 bg-white/[0.02] p-2">
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New citation name"
            disabled={disabled}
            className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="URL"
            disabled={disabled}
            className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={addCitation}
          disabled={disabled || (!newName.trim() && !newUrl.trim())}
          className="rounded-lg bg-fuchsia-500/20 p-2 text-fuchsia-200 transition hover:bg-fuchsia-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Add citation"
        >
          <Icon icon="lucide:plus" className="h-5 w-5" size={20} />
        </button>
      </div>

      {meta.description && (
        <p className="text-xs text-white/50">{meta.description}</p>
      )}
    </div>
  );
}
