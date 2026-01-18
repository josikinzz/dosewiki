/**
 * RHF-based Dosage and Duration fields component.
 * Uses useFieldArray for route management.
 */

import { useCallback } from "react";
import { useFormContext, type UseFieldArrayReturn } from "react-hook-form";
import { Icon } from "../../common/Icon";
import yaml from "yaml";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { DoseRangeStringInput, DurationStageStringInput } from "./rhf";
import type { SubstanceArticle, Dosage, Duration } from "../../../schema";
import { SectionGenerator } from "../tools/articles/SectionGenerator";
import { useOptionalArticlesContext } from "../tools/articles/ArticlesContext";
import { useSectionPrompt } from "../../../hooks/usePrompts";

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
  durationRoutes: _durationRoutes,
  addDosageRoute,
  removeDosageRoute,
  applyDurationFromRoute,
}: DosageDurationFieldsRHFProps) {
  const { register, setValue, getValues } = useFormContext<SubstanceArticle>();
  const articlesContext = useOptionalArticlesContext();

  // Load prompt from Convex
  const { content: dosageDurationPrompt } = useSectionPrompt("dosage_duration");

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Handle applying generated dosage/duration YAML to form
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = yaml.parse(generatedYaml);
      const dosage: Dosage = parsed.dosage ?? {};
      const duration: Duration = parsed.duration ?? {};

      // Update dosage routes
      if (dosage.routes && Array.isArray(dosage.routes)) {
        setValue("dosage.routes", dosage.routes);
      }

      // Update duration routes
      if (duration.routes && Array.isArray(duration.routes)) {
        setValue("duration.routes", duration.routes);
      }
    } catch (error) {
      console.error("Failed to parse generated dosage/duration YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-6">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Dosage & Duration"
          sectionKey="dosage_duration"
          prompt={dosageDurationPrompt}
          extractedContent={articlesContext.dosageDurationQuotes}
          extractedSources={articlesContext.dosageDurationSources}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          substanceSlug={articlesContext.selectedSubstanceSlug}
          quoteSection="dosage_duration"
        />
      )}

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
              <div className="grid gap-4 md:grid-cols-3">
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
                <div className="space-y-2">
                  <Label>Bioavailability Notes</Label>
                  <Textarea
                    {...register(`dosage.routes.${index}.bioavailability_notes`)}
                    placeholder="e.g., Extensive first-pass metabolism"
                    className="min-h-[38px] resize-y"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
                  <Icon icon="lucide:chart-column-increasing" size={14} className="text-fuchsia-300" />
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
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
                    <Icon icon="lucide:chart-line" size={14} className="text-fuchsia-300" />
                    Duration Stages
                  </p>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-white/50">Half-life:</Label>
                    <Input
                      {...register(`duration.routes.${index}.half_life`)}
                      placeholder="e.g., 3-6 hours"
                      className="h-7 w-32 text-xs"
                    />
                  </div>
                </div>
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
                <div className="space-y-2">
                  <Label>Half-life Notes</Label>
                  <Textarea
                    {...register(`duration.routes.${index}.half_life_notes`)}
                    placeholder="e.g., Dose-dependent elimination; CYP2D6 polymorphisms affect half-life"
                    className="min-h-[38px] resize-y"
                  />
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
