import { Input } from "@/components/ui/input";
import { EditorField } from "@/features/dev/components";
import type { FieldMeta } from "@/data/schema";

interface DoseFieldProps {
  meta: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
}

/**
 * Input field for dose ranges.
 * Accepts human-friendly formats like "10-20 mg", "15+ ug", "<5 g"
 * Transformer handles conversion to/from schema format { min, max, unit }
 */
export function DoseField({ meta, value, onChange, disabled, error }: DoseFieldProps) {
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
          placeholder={meta.placeholder || "e.g., 10-20 mg"}
          disabled={disabled}
          variant={error ? "error" : "default"}
        />
      )}
    </EditorField>
  );
}
