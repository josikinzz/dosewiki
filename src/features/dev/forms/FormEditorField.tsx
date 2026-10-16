import { get, useFormContext, useFormState, type FieldPath } from "react-hook-form";

import { EditorField, type EditorFieldProps } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";

export interface FormEditorFieldProps extends Omit<EditorFieldProps, "error"> {
  name: FieldPath<SubstanceArticle>;
}

export function FormEditorField({ name, ...props }: FormEditorFieldProps) {
  const { control } = useFormContext<SubstanceArticle>();
  const { errors } = useFormState({ control, name });
  const message = (get(errors, name) as { message?: unknown } | undefined)?.message;

  return (
    <EditorField
      {...props}
      error={typeof message === "string" && message.length > 0 ? message : undefined}
      errorLive
    />
  );
}
