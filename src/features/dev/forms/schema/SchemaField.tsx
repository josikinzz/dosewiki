import { useCallback } from "react";
import type { FieldMeta, Citation } from "@/data/schema";
import {
  TextField,
  TextareaField,
  TagArrayField,
  DoseField,
  DurationField,
  NumberField,
  CitationField,
} from "./fields";

interface SchemaFieldProps {
  meta: FieldMeta;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

/**
 * Renders the appropriate input component based on field type.
 * Handles value transformation automatically using the field's transformer.
 */
export function SchemaField({
  meta,
  value,
  onChange,
  disabled,
}: SchemaFieldProps) {
  // Convert schema value to form value for display
  const displayValue = meta.transformer
    ? meta.transformer.toForm(value)
    : value;

  // Handle change by converting form value back to schema value
  const handleChange = useCallback(
    (formValue: unknown) => {
      if (meta.transformer) {
        const schemaValue = meta.transformer.toSchema(formValue as string);
        onChange(schemaValue);
      } else {
        onChange(formValue);
      }
    },
    [meta.transformer, onChange]
  );

  // For array fields that don't use transformers, pass array directly
  const handleArrayChange = useCallback(
    (arrayValue: string[]) => {
      onChange(arrayValue);
    },
    [onChange]
  );

  // For citation fields
  const handleCitationChange = useCallback(
    (citations: Citation[]) => {
      onChange(citations);
    },
    [onChange]
  );

  switch (meta.type) {
    case "text":
      return (
        <TextField
          meta={meta}
          value={String(displayValue ?? "")}
          onChange={handleChange}
          disabled={disabled}
        />
      );

    case "textarea":
      return (
        <TextareaField
          meta={meta}
          value={String(displayValue ?? "")}
          onChange={handleChange}
          disabled={disabled}
        />
      );

    case "number":
      return (
        <NumberField
          meta={meta}
          value={displayValue != null ? String(displayValue) : ""}
          onChange={handleChange}
          disabled={disabled}
        />
      );

    case "array":
    case "tagArray":
      // If there's a transformer, use the transformed string value
      // Otherwise, expect an array
      if (meta.transformer) {
        return (
          <TagArrayField
            meta={meta}
            value={Array.isArray(value) ? value : []}
            onChange={handleArrayChange}
            disabled={disabled}
          />
        );
      }
      return (
        <TagArrayField
          meta={meta}
          value={Array.isArray(value) ? value : []}
          onChange={handleArrayChange}
          disabled={disabled}
        />
      );

    case "dose":
      return (
        <DoseField
          meta={meta}
          value={String(displayValue ?? "")}
          onChange={handleChange}
          disabled={disabled}
        />
      );

    case "duration":
      return (
        <DurationField
          meta={meta}
          value={String(displayValue ?? "")}
          onChange={handleChange}
          disabled={disabled}
        />
      );

    case "citation":
      return (
        <CitationField
          meta={meta}
          value={Array.isArray(value) ? (value as Citation[]) : []}
          onChange={handleCitationChange}
          disabled={disabled}
        />
      );

    case "object":
      // For object types with transformers (like record fields), use textarea
      if (meta.transformer) {
        return (
          <TextareaField
            meta={meta}
            value={String(displayValue ?? "")}
            onChange={handleChange}
            disabled={disabled}
            rows={6}
          />
        );
      }
      // For complex objects without transformers, show as JSON
      return (
        <TextareaField
          meta={meta}
          value={
            typeof value === "object" && value !== null
              ? JSON.stringify(value, null, 2)
              : ""
          }
          onChange={(jsonStr) => {
            try {
              onChange(JSON.parse(jsonStr));
            } catch {
              // Invalid JSON, don't update
            }
          }}
          disabled={disabled}
          rows={6}
        />
      );

    default:
      return (
        <TextField
          meta={meta}
          value={String(displayValue ?? "")}
          onChange={handleChange}
          disabled={disabled}
        />
      );
  }
}
