import { useCallback, useState } from "react";

import type { FieldMeta, Reference } from "@/data/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditorField, EditorSelect } from "@/features/dev/components";
import { EntryCard } from "@/features/dev/forms/EntryCard";
import {
  REFERENCE_QUALITY_OPTIONS,
  REFERENCE_SOURCE_TYPE_OPTIONS,
  REFERENCE_TYPE_OPTIONS,
  createEmptyReference,
  formatReferenceAuthors,
  formatReferenceYear,
  normalizeOptionalReferenceText,
  parseReferenceAuthors,
  parseReferenceYear,
} from "@/features/dev/forms/referenceFormShared";

interface ReferenceFieldProps {
  meta: FieldMeta;
  value: Reference[];
  onChange: (value: Reference[]) => void;
  disabled?: boolean;
}

export function ReferenceField({
  meta,
  value,
  onChange,
  disabled,
}: ReferenceFieldProps) {
  const [draft, setDraft] = useState<Reference>(createEmptyReference());

  const updateReference = useCallback(
    (index: number, patch: Partial<Reference>) => {
      const next = [...value];
      next[index] = { ...next[index], ...patch };
      onChange(next);
    },
    [onChange, value],
  );

  const removeReference = useCallback(
    (index: number) => {
      onChange(value.filter((_, itemIndex) => itemIndex !== index));
    },
    [onChange, value],
  );

  const addReference = useCallback(() => {
    if (!draft.id.trim() && !draft.title.trim()) return;
    onChange([...value, { ...draft }]);
    setDraft(createEmptyReference());
  }, [draft, onChange, value]);

  const renderReferenceEditor = (
    reference: Reference,
    onPatch: (patch: Partial<Reference>) => void,
    keyPrefix: string,
  ) => (
    <div className="grid gap-2 md:grid-cols-2">
      <Input
        type="text"
        value={reference.id}
        onChange={(event) => onPatch({ id: event.target.value })}
        placeholder="Stable ID"
        disabled={disabled}
        inputSize="sm"
      />
      <Input
        type="text"
        value={reference.title}
        onChange={(event) => onPatch({ title: event.target.value })}
        placeholder="Title"
        disabled={disabled}
        inputSize="sm"
      />
      <Input
        type="text"
        value={formatReferenceAuthors(reference.authors)}
        onChange={(event) => onPatch({ authors: parseReferenceAuthors(event.target.value) })}
        placeholder="Authors"
        disabled={disabled}
        inputSize="sm"
      />
      <Input
        type="text"
        value={formatReferenceYear(reference.year)}
        onChange={(event) => onPatch({ year: parseReferenceYear(event.target.value) })}
        placeholder="Year"
        disabled={disabled}
        inputSize="sm"
      />
      <EditorSelect
        value={reference.type}
        onChange={(event) => onPatch({ type: event.target.value as Reference["type"] })}
        disabled={disabled}
        selectSize="sm"
      >
        {REFERENCE_TYPE_OPTIONS.map((option) => (
          <option key={`${keyPrefix}-type-${option}`} value={option}>
            {option}
          </option>
        ))}
      </EditorSelect>
      <EditorSelect
        value={reference.quality}
        onChange={(event) => onPatch({ quality: event.target.value as Reference["quality"] })}
        disabled={disabled}
        selectSize="sm"
      >
        {REFERENCE_QUALITY_OPTIONS.map((option) => (
          <option key={`${keyPrefix}-quality-${option}`} value={option}>
            {option}
          </option>
        ))}
      </EditorSelect>
      <div className="md:col-span-2">
        <EditorSelect
          value={reference.sourceType}
          onChange={(event) => onPatch({ sourceType: event.target.value as Reference["sourceType"] })}
          disabled={disabled}
          selectSize="sm"
        >
          {REFERENCE_SOURCE_TYPE_OPTIONS.map((option) => (
            <option key={`${keyPrefix}-source-type-${option}`} value={option}>
              {option}
            </option>
          ))}
        </EditorSelect>
      </div>
      <Input
        type="text"
        value={reference.url ?? ""}
        onChange={(event) => onPatch({ url: normalizeOptionalReferenceText(event.target.value) })}
        placeholder="URL"
        disabled={disabled}
        inputSize="sm"
      />
      <Input
        type="text"
        value={reference.doi ?? ""}
        onChange={(event) => onPatch({ doi: normalizeOptionalReferenceText(event.target.value) })}
        placeholder="DOI"
        disabled={disabled}
        inputSize="sm"
      />
      <Textarea
        value={reference.apaText ?? ""}
        onChange={(event) => onPatch({ apaText: normalizeOptionalReferenceText(event.target.value) })}
        placeholder="APA override"
        disabled={disabled}
        rows={3}
        textareaSize="sm"
        className="md:col-span-2"
      />
    </div>
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
            {value.map((reference, index) => (
              <EntryCard
                key={`${reference.id || "reference"}-${index}`}
                title={reference.id || `Reference ${index + 1}`}
                onRemove={disabled ? undefined : () => removeReference(index)}
                removeLabel="Remove reference"
                bodyClassName="space-y-2"
              >
                {renderReferenceEditor(reference, (patch) => updateReference(index, patch), `reference-${index}`)}
              </EntryCard>
            ))}
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-dashed border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] p-3">
          {renderReferenceEditor(draft, (patch) => setDraft((current) => ({ ...current, ...patch })), "draft")}
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={addReference}
            disabled={disabled || (!draft.id.trim() && !draft.title.trim())}
          >
            Add reference
          </Button>
        </div>
      </div>
    </EditorField>
  );
}
