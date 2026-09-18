/**
 * AttributionEditor - Edit the attribution section for subjective effects.
 * Contains author, text, and url fields.
 */

import { get, useFormContext, useFormState } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { CollapsibleEditorCard } from "../CollapsibleEditorCard";
import { FormEditorField } from "../FormEditorField";
import type { SubstanceArticle } from "@/schema";

export interface AttributionEditorProps {
  /** Prefix for input IDs */
  idPrefix: string;
  pairedIndicator?: boolean;
}

function AttributionFields({ idPrefix }: AttributionEditorProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <FormEditorField
          name="subjective_effects.attribution.author"
          htmlFor={`${idPrefix}-attribution-author`}
          label="Author"
        >
          <Input
            id={`${idPrefix}-attribution-author`}
            {...register("subjective_effects.attribution.author")}
            placeholder="e.g., Josie Kins"
          />
        </FormEditorField>

        <FormEditorField
          name="subjective_effects.attribution.url"
          htmlFor={`${idPrefix}-attribution-url`}
          label="Source URL"
        >
          <Input
            id={`${idPrefix}-attribution-url`}
            {...register("subjective_effects.attribution.url")}
            placeholder="https://..."
            type="url"
          />
        </FormEditorField>
      </div>

      <FormEditorField
        name="subjective_effects.attribution.text"
        htmlFor={`${idPrefix}-attribution-text`}
        label="Attribution Text"
      >
        <Input
          id={`${idPrefix}-attribution-text`}
          {...register("subjective_effects.attribution.text")}
          placeholder="Forked from Subjective Effect Documentation by Josie Kins, September 2015."
        />
      </FormEditorField>
    </div>
  );
}

export function AttributionEditor({ idPrefix, pairedIndicator = false }: AttributionEditorProps) {
  const { control } = useFormContext<SubstanceArticle>();
  const { errors } = useFormState({
    control,
    name: "subjective_effects.attribution",
  });
  const hasError = Boolean(get(errors, "subjective_effects.attribution"));

  return (
    <CollapsibleEditorCard
      title="Attribution"
      icon={<Icon icon="lucide:quote" size={20} />}
      badge={<span className="theme-text-faint text-xs">(optional)</span>}
      density="compact"
      hasError={hasError}
      pairedIndicator={pairedIndicator}
    >
      <AttributionFields idPrefix={idPrefix} />
    </CollapsibleEditorCard>
  );
}
