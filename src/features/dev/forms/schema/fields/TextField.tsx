import { Input } from "@/components/ui/input";
import { EditorField } from "@/features/dev/components";
import type { FieldMeta } from "@/data/schema";

interface TextFieldProps {
  meta: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
}

export function TextField({ meta, value, onChange, disabled, error }: TextFieldProps) {
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
          placeholder={meta.placeholder}
          disabled={disabled}
          variant={error ? "error" : "default"}
        />
      )}
    </EditorField>
  );
}
