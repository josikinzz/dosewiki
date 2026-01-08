import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { SectionHeader } from "./FormHelpers";
import type { CitationsFieldsProps } from "./types";

export const CitationsFields = ({
  idPrefix,
  form,
  handleCitationFieldChange,
  addCitationEntry,
  removeCitationEntry,
}: CitationsFieldsProps) => (
  <section className="space-y-6">
    <SectionHeader
      title="Citations"
      description="Powers the final citations list; keep order consistent with supporting notes."
    />
    <div className="space-y-4">
      {form.citations.map((citation, index) => {
        const citationKey = `${idPrefix}-citation-${index}`;
        return (
          <div key={citationKey} className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white/75">Citation {index + 1}</p>
              {form.citations.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCitationEntry(index)}
                >
                  Remove
                </Button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Citation label</Label>
                <Input
                  value={citation.name}
                  onChange={handleCitationFieldChange(index, "name")}
                  placeholder="TripSit"
                />
              </div>
              <div className="space-y-2">
                <Label>Citation URL</Label>
                <Input
                  value={citation.reference}
                  onChange={handleCitationFieldChange(index, "reference")}
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
      onClick={addCitationEntry}
    >
      Add citation
    </Button>
  </section>
);
