/**
 * RHF-based Dosage and Duration fields component.
 * Uses useFieldArray for route management.
 */

import { useFormContext, type UseFieldArrayReturn } from "react-hook-form";
import { ChartColumnIncreasing, ChartLine } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { DoseRangeStringInput, DurationStageStringInput } from "./rhf";
import type { SubstanceArticle } from "../../../schema";

// Dose range tier labels
const doseRangeLabels: Array<["threshold" | "light" | "moderate" | "strong" | "heavy", string]> = [
  ["threshold", "Threshold"],
  ["light", "Light"],
  ["moderate", "Moderate"],
  ["strong", "Strong"],
  ["heavy", "Heavy"],
];

// Duration stage labels with placeholders - matches public section display order
const durationStageLabels: Array<["onset" | "come_up" | "peak" | "offset" | "after_effects" | "total_duration", string, string]> = [
  ["onset", "Onset", "e.g., 15-30 minutes"],
  ["come_up", "Come-up", "e.g., 30-60 minutes"],
  ["peak", "Peak", "e.g., 2-3 hours"],
  ["offset", "Offset", "e.g., ~2 hours"],
  ["after_effects", "After Effects", "e.g., Residual stimulation"],
  ["total_duration", "Total Duration", "e.g., 6-8 hours"],
];

export type DosageDurationFieldsRHFProps = {
  idPrefix: string;
  dosageRoutes: UseFieldArrayReturn<SubstanceArticle, "dosage.routes">;
  durationRoutes: UseFieldArrayReturn<SubstanceArticle, "duration.routes">;
  addDosageRoute: () => void;
  removeDosageRoute: (index: number) => void;
  applyDurationFromRoute: (fromIndex: number, toIndex: number) => void;
};

export function DosageDurationFieldsRHF({
  idPrefix,
  dosageRoutes,
  durationRoutes,
  addDosageRoute,
  removeDosageRoute,
  applyDurationFromRoute,
}: DosageDurationFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <section className="space-y-6">
      <div className="space-y-4">
        {dosageRoutes.fields.map((field, index) => {
          const routeKey = `${idPrefix}-route-${index}`;
          return (
            <div key={field.id} className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white/75">Route {index + 1}</p>
                <div className="flex gap-2">
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => applyDurationFromRoute(0, index)}
                    >
                      Copy duration from Route 1
                    </Button>
                  )}
                  {dosageRoutes.fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDosageRoute(index)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Administration route</Label>
                  <Input
                    {...register(`dosage.routes.${index}.route`)}
                    placeholder="e.g., Oral"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bioavailability</Label>
                  <Input
                    {...register(`dosage.routes.${index}.bioavailability`)}
                    placeholder="e.g., 70-80%"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
                  <ChartColumnIncreasing className="h-3.5 w-3.5 text-fuchsia-300" />
                  Dose Ranges
                </p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {doseRangeLabels.map(([key, label]) => (
                    <div key={`${routeKey}-${key}`} className="space-y-1">
                      <Label>{label}</Label>
                      <DoseRangeStringInput
                        name={`dosage.routes.${index}.dose_ranges.${key}`}
                        placeholder="e.g., 10-20 mg"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
                  <ChartLine className="h-3.5 w-3.5 text-fuchsia-300" />
                  Duration Stages
                </p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {durationStageLabels.map(([stageKey, label, placeholder]) => (
                    <div key={`${routeKey}-duration-${stageKey}`} className="space-y-1">
                      <Label>{label}</Label>
                      <DurationStageStringInput
                        name={`duration.routes.${index}.stages.${stageKey}`}
                        placeholder={placeholder}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Route Notes</Label>
                <Input
                  {...register(`dosage.routes.${index}.notes`)}
                  placeholder="Additional notes for this route"
                />
              </div>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={addDosageRoute}
      >
        Add route
      </Button>
    </section>
  );
}
