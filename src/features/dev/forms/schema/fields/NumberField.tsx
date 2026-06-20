import { Input } from "@/components/ui/input";
import { EditorField } from "@/features/dev/components";
import type { FieldMeta } from "@/data/schema";

interface NumberFieldProps {
  meta: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
}

export function NumberField({
  meta,
  value,
  onChange,
  disabled,
  error,
}: NumberFieldProps) {
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
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={meta.placeholder}
          disabled={disabled}
          variant={error ? "error" : "default"}
        />
      )}
    </EditorField>
  );
}
