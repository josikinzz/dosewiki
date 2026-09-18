import { get, useFormContext, useFormState, type FieldPath } from "react-hook-form";

import { EditorField, type EditorFieldProps } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";

export interface FormEditorFieldProps extends Omit<EditorFieldProps, "error"> {
  /** Form path this field edits. Its resolver error fills the error slot. */
  name: FieldPath<SubstanceArticle>;
}

/**
 * `EditorField` wired to the article resolver. The Zod resolver only runs
 * through `handleSubmit`/blur validation, so the message has to reach the field
 * that produced it rather than living only in the submit-time notice.
 */
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
