import { useCallback, useState } from "react";

import type { FieldMeta, Reference } from "@/data/schema";
import { Icon } from "@/components/common/Icon";
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
      <input
        type="text"
        value={reference.id}
        onChange={(event) => onPatch({ id: event.target.value })}
        placeholder="Stable ID"
        disabled={disabled}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <input
        type="text"
        value={reference.title}
        onChange={(event) => onPatch({ title: event.target.value })}
        placeholder="Title"
        disabled={disabled}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <input
        type="text"
        value={formatReferenceAuthors(reference.authors)}
        onChange={(event) => onPatch({ authors: parseReferenceAuthors(event.target.value) })}
        placeholder="Authors"
        disabled={disabled}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <input
        type="text"
        value={formatReferenceYear(reference.year)}
        onChange={(event) => onPatch({ year: parseReferenceYear(event.target.value) })}
        placeholder="Year"
        disabled={disabled}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <select
        value={reference.type}
        onChange={(event) => onPatch({ type: event.target.value as Reference["type"] })}
        disabled={disabled}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {REFERENCE_TYPE_OPTIONS.map((option) => (
          <option key={`${keyPrefix}-type-${option}`} value={option} className="bg-slate-950">
            {option}
          </option>
        ))}
      </select>
      <select
        value={reference.quality}
        onChange={(event) => onPatch({ quality: event.target.value as Reference["quality"] })}
        disabled={disabled}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {REFERENCE_QUALITY_OPTIONS.map((option) => (
          <option key={`${keyPrefix}-quality-${option}`} value={option} className="bg-slate-950">
            {option}
          </option>
        ))}
      </select>
      <select
        value={reference.sourceType}
        onChange={(event) => onPatch({ sourceType: event.target.value as Reference["sourceType"] })}
        disabled={disabled}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
      >
        {REFERENCE_SOURCE_TYPE_OPTIONS.map((option) => (
          <option key={`${keyPrefix}-source-type-${option}`} value={option} className="bg-slate-950">
            {option}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={reference.url ?? ""}
        onChange={(event) => onPatch({ url: normalizeOptionalReferenceText(event.target.value) })}
        placeholder="URL"
        disabled={disabled}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <input
        type="text"
        value={reference.doi ?? ""}
        onChange={(event) => onPatch({ doi: normalizeOptionalReferenceText(event.target.value) })}
        placeholder="DOI"
        disabled={disabled}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <textarea
        value={reference.apaText ?? ""}
        onChange={(event) => onPatch({ apaText: normalizeOptionalReferenceText(event.target.value) })}
        placeholder="APA override"
        disabled={disabled}
        rows={3}
        className="w-full rounded border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-1 text-[16px] text-white placeholder-white/40 focus:border-fuchsia-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-white/80">
        {meta.label}
        {meta.required && <span className="ml-1 text-fuchsia-400">*</span>}
      </label>

      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((reference, index) => (
            <div
              key={`${reference.id || "reference"}-${index}`}
              className="space-y-2 rounded-lg border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-panel-base))] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-white/75">{reference.id || `Reference ${index + 1}`}</p>
                <button
                  type="button"
                  onClick={() => removeReference(index)}
                  disabled={disabled}
                  className="rounded-full p-1 text-white/50 transition hover:bg-[color-mix(in_srgb,#fff_10%,var(--theme-control-base))] hover:text-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Remove reference"
                >
                  <Icon icon="lucide:x" className="h-4 w-4" size={16} />
                </button>
              </div>
              {renderReferenceEditor(reference, (patch) => updateReference(index, patch), `reference-${index}`)}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-dashed border-white/20 bg-[color-mix(in_srgb,#fff_2%,var(--theme-panel-base))] p-3">
        {renderReferenceEditor(draft, (patch) => setDraft((current) => ({ ...current, ...patch })), "draft")}
        <button
          type="button"
          onClick={addReference}
          disabled={disabled || (!draft.id.trim() && !draft.title.trim())}
          className="rounded-lg bg-[color-mix(in_srgb,#d946ef_20%,var(--theme-control-base))] px-3 py-2 text-sm font-medium text-fuchsia-100 transition hover:bg-[color-mix(in_srgb,#d946ef_30%,var(--theme-control-base))] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add reference
        </button>
      </div>

      {meta.description && <p className="text-xs text-white/50">{meta.description}</p>}
    </div>
  );
}
