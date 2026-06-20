import type { FieldType, FieldMeta, Citation, Reference } from "@/data/schema";
import type { ReactElement } from "react";
import { CitationField } from "./CitationField";
import { DoseField } from "./DoseField";
import { DurationField } from "./DurationField";
import { NumberField } from "./NumberField";
import { ReferenceField } from "./ReferenceField";
import { TagArrayField } from "./TagArrayField";
import { TextareaField } from "./TextareaField";
import { TextField } from "./TextField";

export type FieldAdapterType = FieldType | "fallback";

export type SchemaValueResult =
  | { valid: true; value: unknown }
  | { valid: false; error: string };

export interface FieldAdapterRenderProps<TDisplayValue = unknown> {
  meta: FieldMeta;
  value: TDisplayValue;
  onChange: (value: TDisplayValue) => void;
  disabled?: boolean;
  error?: string | null;
}

export interface FieldAdapter<TDisplayValue = unknown> {
  type: FieldAdapterType;
  toDisplayValue: (meta: FieldMeta, value: unknown) => TDisplayValue;
  toSchemaValue: (meta: FieldMeta, displayValue: TDisplayValue) => SchemaValueResult;
  validateDraft?: (meta: FieldMeta, displayValue: TDisplayValue) => string | null;
  render: (props: FieldAdapterRenderProps<TDisplayValue>) => ReactElement;
}

function applyTransformer(meta: FieldMeta, formValue: unknown): SchemaValueResult {
  if (!meta.transformer) {
    return { valid: true, value: formValue };
  }

  return {
    valid: true,
    value: meta.transformer.toSchema(formValue as string),
  };
}

function transformedDisplayValue(meta: FieldMeta, value: unknown): unknown {
  return meta.transformer ? meta.transformer.toForm(value) : value;
}

function stringDisplayValue(meta: FieldMeta, value: unknown): string {
  return String(transformedDisplayValue(meta, value) ?? "");
}

function arrayDisplayValue(_meta: FieldMeta, value: unknown): string[] {
  return Array.isArray(value) ? value : [];
}

function citationDisplayValue(_meta: FieldMeta, value: unknown): Citation[] {
  return Array.isArray(value) ? (value as Citation[]) : [];
}

function referenceDisplayValue(_meta: FieldMeta, value: unknown): Reference[] {
  return Array.isArray(value) ? (value as Reference[]) : [];
}

const textAdapter: FieldAdapter<string> = {
  type: "text",
  toDisplayValue: stringDisplayValue,
  toSchemaValue: applyTransformer,
  render: ({ meta, value, onChange, disabled }) => (
    <TextField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  ),
};

const textareaAdapter: FieldAdapter<string> = {
  type: "textarea",
  toDisplayValue: stringDisplayValue,
  toSchemaValue: applyTransformer,
  render: ({ meta, value, onChange, disabled, error }) => (
    <TextareaField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
      error={error}
    />
  ),
};

const numberAdapter: FieldAdapter<string> = {
  type: "number",
  toDisplayValue: (meta, value) => {
    const displayValue = transformedDisplayValue(meta, value);
    return displayValue != null ? String(displayValue) : "";
  },
  toSchemaValue: applyTransformer,
  render: ({ meta, value, onChange, disabled, error }) => (
    <NumberField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
      error={error}
    />
  ),
};

const tagArrayAdapter: FieldAdapter<string[]> = {
  type: "tagArray",
  toDisplayValue: arrayDisplayValue,
  toSchemaValue: (_meta, displayValue) => ({
    valid: true,
    value: displayValue,
  }),
  render: ({ meta, value, onChange, disabled }) => (
    <TagArrayField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  ),
};

const arrayAdapter: FieldAdapter<string[]> = {
  ...tagArrayAdapter,
  type: "array",
};

const doseAdapter: FieldAdapter<string> = {
  type: "dose",
  toDisplayValue: stringDisplayValue,
  toSchemaValue: applyTransformer,
  render: ({ meta, value, onChange, disabled, error }) => (
    <DoseField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
      error={error}
    />
  ),
};

const durationAdapter: FieldAdapter<string> = {
  type: "duration",
  toDisplayValue: stringDisplayValue,
  toSchemaValue: applyTransformer,
  render: ({ meta, value, onChange, disabled, error }) => (
    <DurationField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
      error={error}
    />
  ),
};

const citationAdapter: FieldAdapter<Citation[]> = {
  type: "citation",
  toDisplayValue: citationDisplayValue,
  toSchemaValue: (_meta, displayValue) => ({
    valid: true,
    value: displayValue,
  }),
  render: ({ meta, value, onChange, disabled }) => (
    <CitationField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  ),
};

const referenceAdapter: FieldAdapter<Reference[]> = {
  type: "reference",
  toDisplayValue: referenceDisplayValue,
  toSchemaValue: (_meta, displayValue) => ({
    valid: true,
    value: displayValue,
  }),
  render: ({ meta, value, onChange, disabled }) => (
    <ReferenceField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  ),
};

const objectAdapter: FieldAdapter<string> = {
  type: "object",
  toDisplayValue: (meta, value) => {
    if (meta.transformer) {
      return stringDisplayValue(meta, value);
    }

    return typeof value === "object" && value !== null
      ? JSON.stringify(value, null, 2)
      : "";
  },
  toSchemaValue: (meta, displayValue) => {
    if (meta.transformer) {
      return applyTransformer(meta, displayValue);
    }

    try {
      return { valid: true, value: JSON.parse(displayValue) };
    } catch {
      return { valid: false, error: "Invalid JSON. Fix the draft before saving this field." };
    }
  },
  validateDraft: (meta, displayValue) => {
    const result = objectAdapter.toSchemaValue(meta, displayValue);
    return result.valid === true ? null : result.error;
  },
  render: ({ meta, value, onChange, disabled, error }) => (
    <TextareaField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
      rows={6}
      error={error}
    />
  ),
};

export const FALLBACK_FIELD_ADAPTER: FieldAdapter<string> = {
  type: "fallback",
  toDisplayValue: stringDisplayValue,
  toSchemaValue: applyTransformer,
  render: ({ meta, value, onChange, disabled }) => (
    <TextField
      meta={meta}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  ),
};

export const FIELD_ADAPTERS: Record<FieldType, FieldAdapter> = {
  text: textAdapter,
  textarea: textareaAdapter,
  number: numberAdapter,
  array: arrayAdapter,
  tagArray: tagArrayAdapter,
  dose: doseAdapter,
  duration: durationAdapter,
  object: objectAdapter,
  citation: citationAdapter,
  reference: referenceAdapter,
};

export function getFieldAdapter(type: string): FieldAdapter {
  return (FIELD_ADAPTERS as Record<string, FieldAdapter>)[type] ?? FALLBACK_FIELD_ADAPTER;
}
