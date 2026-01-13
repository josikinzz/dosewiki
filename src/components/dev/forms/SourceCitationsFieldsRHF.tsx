/**
 * RHF-based Source Citations fields component.
 * Uses useFieldArray for source citation management.
 */

import { useFormContext, type UseFieldArrayReturn } from "react-hook-form";
import { BookOpen } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { SectionHeader } from "./FormHelpers";
import type { SubstanceArticle } from "../../../schema";

export type SourceCitationsFieldsRHFProps = {
  idPrefix: string;
  sourceCitations: UseFieldArrayReturn<SubstanceArticle, "source_citations">;
  addSourceCitation: () => void;
  removeSourceCitation: (index: number) => void;
};

export function SourceCitationsFieldsRHF({
  idPrefix,
  sourceCitations,
  addSourceCitation,
  removeSourceCitation,
}: SourceCitationsFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Sources"
        description="Primary sources from article-sources used to populate this article."
        icon={<BookOpen className="h-5 w-5" />}
      />
      <div className="space-y-4">
        {sourceCitations.fields.map((field, index) => {
          const citationKey = `${idPrefix}-source-citation-${index}`;
          return (
            <div key={field.id} className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white/75">Source {index + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSourceCitation(index)}
                >
                  Remove
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Source name</Label>
                  <Input
                    {...register(`source_citations.${index}.name`)}
                    placeholder="PsychonautWiki"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source URL</Label>
                  <Input
                    {...register(`source_citations.${index}.url`)}
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
        onClick={addSourceCitation}
      >
        Add source
      </Button>
    </section>
  );
}
