/**
 * AttributionEditor - Edit the attribution section for subjective effects.
 * Contains author, text, and url fields.
 */

import { useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleEditorCard } from "../CollapsibleEditorCard";
import type { SubstanceArticle } from "@/schema";

export interface AttributionEditorProps {
  /** Prefix for input IDs */
  idPrefix: string;
}

export function AttributionEditor({ idPrefix }: AttributionEditorProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <CollapsibleEditorCard
      title="Attribution"
      icon={<Icon icon="lucide:quote" size={20} />}
      badge={<span className="theme-text-faint text-xs">(optional)</span>}
      density="compact"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-attribution-author`}>
              Author
            </Label>
            <Input
              id={`${idPrefix}-attribution-author`}
              {...register("subjective_effects.attribution.author")}
              placeholder="e.g., Josie Kins"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-attribution-url`}>
              Source URL
            </Label>
            <Input
              id={`${idPrefix}-attribution-url`}
              {...register("subjective_effects.attribution.url")}
              placeholder="https://..."
              type="url"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-attribution-text`}>
            Attribution Text
          </Label>
          <Input
            id={`${idPrefix}-attribution-text`}
            {...register("subjective_effects.attribution.text")}
            placeholder="Forked from Subjective Effect Documentation by Josie Kins, September 2015."
          />
        </div>
      </div>
    </CollapsibleEditorCard>
  );
}
