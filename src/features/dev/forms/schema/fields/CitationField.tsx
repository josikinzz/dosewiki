import { useState, useCallback } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorField } from "@/features/dev/components";
import { EntryCard } from "@/features/dev/forms/EntryCard";
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
    <EditorField
      id={meta.path}
      label={meta.label}
      required={meta.required}
      description={meta.description}
    >
      <div className="space-y-3">
        {value.length > 0 && (
          <div className="space-y-2">
            {value.map((citation, index) => (
              <EntryCard
                key={index}
                onRemove={disabled ? undefined : () => removeCitation(index)}
                removeLabel="Remove citation"
                bodyClassName="space-y-2"
              >
                <Input
                  type="text"
                  value={citation.name}
                  onChange={(e) => updateCitation(index, "name", e.target.value)}
                  placeholder="Citation name"
                  disabled={disabled}
                  inputSize="sm"
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="url"
                    value={citation.url}
                    onChange={(e) => updateCitation(index, "url", e.target.value)}
                    placeholder="URL"
                    disabled={disabled}
                    inputSize="sm"
                    className="flex-1"
                  />
                  {citation.url && (
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="theme-accent-emphasis rounded-full p-1 transition hover:text-[color:var(--theme-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]"
                      aria-label="Open URL"
                    >
                      <Icon icon="lucide:external-link" className="h-4 w-4" size={16} />
                    </a>
                  )}
                </div>
              </EntryCard>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-lg border border-dashed border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] p-2">
          <div className="flex-1 space-y-2">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New citation name"
              disabled={disabled}
              inputSize="sm"
            />
            <Input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="URL"
              disabled={disabled}
              inputSize="sm"
            />
          </div>
          <Button
            type="button"
            variant="accent"
            size="icon"
            onClick={addCitation}
            disabled={disabled || (!newName.trim() && !newUrl.trim())}
            aria-label="Add citation"
            className="h-10 w-10 shrink-0"
          >
            <Icon icon="lucide:plus" className="h-5 w-5" size={20} />
          </Button>
        </div>
      </div>
    </EditorField>
  );
}
