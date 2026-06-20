import { Input } from "@/components/ui/input";
import { EditorField } from "@/features/dev/components";
import type { FieldMeta } from "@/data/schema";

interface DurationFieldProps {
  meta: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
}

/**
 * Input field for duration stages.
 * Accepts human-friendly formats like "15-30 minutes", "2-4 hours"
 * Transformer handles conversion to/from schema format { min, max, unit }
 */
export function DurationField({
  meta,
  value,
  onChange,
  disabled,
  error,
}: DurationFieldProps) {
  return (
    <EditorField
      id={meta.path}
      label={meta.label}
      required={meta.required}
      description={meta.description}
      error={error}
    >
      {(fieldProps) => (
        <Input
          {...fieldProps}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={meta.placeholder || "e.g., 15-30 minutes"}
          disabled={disabled}
          variant={error ? "error" : "default"}
        />
      )}
    </EditorField>
  );
}
