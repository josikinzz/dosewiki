/**
 * RHF-based Citations fields component.
 * Uses useFieldArray for citation management.
 */

import { useFormContext, type UseFieldArrayReturn } from "react-hook-form";
import { Icon } from "../../common/Icon";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import type { SubstanceArticle } from "../../../schema";

export type CitationsFieldsRHFProps = {
  idPrefix: string;
  citations: UseFieldArrayReturn<SubstanceArticle, "citations">;
  addCitation: () => void;
  removeCitation: (index: number) => void;
};

export function CitationsFieldsRHF({
  idPrefix: _idPrefix,
  citations,
  addCitation,
  removeCitation,
}: CitationsFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        {citations.fields.map((field, index) => {
          return (
            <div key={field.id} className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-white/75">
                  <Icon icon="lucide:library" className="h-4 w-4 text-white/50" size={16} />
                  Citation {index + 1}
                </p>
                {citations.fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCitation(index)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Citation label</Label>
                  <Input
                    {...register(`citations.${index}.name`)}
                    placeholder="TripSit"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Citation URL</Label>
                  <Input
                    {...register(`citations.${index}.url`)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={addCitation}
      >
        Add citation
      </Button>
    </section>
  );
}
