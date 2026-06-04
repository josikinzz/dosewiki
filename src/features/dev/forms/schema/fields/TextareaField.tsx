import { Textarea } from "@/components/ui/textarea";
import { EditorField } from "@/features/dev/components";
import type { FieldMeta } from "@/data/schema";

interface TextareaFieldProps {
  meta: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  error?: string | null;
}

export function TextareaField({
  meta,
  value,
  onChange,
  disabled,
  rows = 4,
  error,
}: TextareaFieldProps) {
  return (
    <EditorField
      id={meta.path}
      label={meta.label}
      required={meta.required}
      description={meta.description}
      error={error}
      errorLive
    >
      {(fieldProps) => (
        <Textarea
          {...fieldProps}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={meta.placeholder}
          disabled={disabled}
          rows={rows}
          variant={error ? "error" : "default"}
          className="resize-y"
        />
      )}
    </EditorField>
  );
}
