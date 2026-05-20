import { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldMeta } from "@/data/schema";
import { getFieldAdapter } from "./fields";

interface SchemaFieldProps {
  meta: FieldMeta;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

/**
 * Renders a schema field by delegating type-specific conversion and rendering
 * to the field Adapter registry.
 */
export function SchemaField({
  meta,
  value,
  onChange,
  disabled,
}: SchemaFieldProps) {
  const adapter = getFieldAdapter(meta.type);
  const schemaDisplayValue = useMemo(
    () => adapter.toDisplayValue(meta, value),
    [adapter, meta, value]
  );
  const [invalidDraft, setInvalidDraft] = useState<unknown>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    setInvalidDraft(null);
    setDraftError(null);
  }, [adapter, meta.path, value]);

  const displayValue = draftError ? invalidDraft : schemaDisplayValue;

  const handleChange = useCallback(
    (displayValue: unknown) => {
      const validationError = adapter.validateDraft?.(meta, displayValue);
      if (validationError) {
        setInvalidDraft(displayValue);
        setDraftError(validationError);
        return;
      }

      const result = adapter.toSchemaValue(meta, displayValue);
      if (result.valid === false) {
        setInvalidDraft(displayValue);
        setDraftError(result.error);
        return;
      }

      setInvalidDraft(null);
      setDraftError(null);
      onChange(result.value);
    },
    [adapter, meta, onChange]
  );

  return adapter.render({
    meta,
    value: displayValue,
    onChange: handleChange,
    disabled,
    error: draftError,
  });
}
