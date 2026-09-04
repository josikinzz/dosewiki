/**
 * RHF-based Dosage and Duration fields component.
 * Uses useFieldArray for route management.
 */

import { useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Icon } from "@/components/common/Icon";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorFieldRow } from "@/features/dev/components";

import { useArticleFormContext } from "./ArticleFormContext";
import { FormEditorField } from "./FormEditorField";
import { EntryCard } from "./EntryCard";
import { DoseRangeStringInput, DurationStageStringInput, ReferenceIdListInput } from "./rhf";
import type { SubstanceArticle } from "@/schema";

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

const ROUTE_MOVE_BUTTON_CLASS =
  `theme-text-faint h-8 w-8 rounded-md p-1 hover:bg-transparent disabled:opacity-30 disabled:cursor-not-allowed ${TOUCH_ICON}`;

export type DosageDurationFieldsRHFProps = {
  idPrefix: string;
};

/**
 * Card titles follow the route name the editor typed, because the card order is
 * the public tab order and a positional label makes reordering unreadable.
 */
function RouteCardTitle({ index }: { index: number }) {
  const routeName = useWatch<SubstanceArticle>({
    name: `dosage.routes.${index}.route`,
  });
  const label = typeof routeName === "string" ? routeName.trim() : "";
  return <>{label.length > 0 ? label : `Route ${index + 1}`}</>;
}

export function DosageDurationFieldsRHF({ idPrefix }: DosageDurationFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();
  const {
    dosageRoutes,
    addDosageRoute,
    removeDosageRoute,
    moveDosageRoute,
    applyDurationFromRoute,
  } = useArticleFormContext();

  const routeCount = dosageRoutes.fields.length;

  const handleMoveUp = useCallback((index: number) => {
    if (index > 0) {
      moveDosageRoute(index, index - 1);
    }
  }, [moveDosageRoute]);

  const handleMoveDown = useCallback((index: number) => {
    if (index < routeCount - 1) {
      moveDosageRoute(index, index + 1);
    }
  }, [moveDosageRoute, routeCount]);

  return (
    <section className="space-y-6">
      <div className="space-y-4">
        {dosageRoutes.fields.map((field, index) => {
          const routeKey = `${idPrefix}-route-${index}`;
          return (
            <EntryCard
              key={field.id}
              title={<RouteCardTitle index={index} />}
              bodyClassName="space-y-4"
              badge={
                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="iconGhost"
                    size="auto"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className={ROUTE_MOVE_BUTTON_CLASS}
                    title="Move route up"
                    aria-label={`Move route ${index + 1} up`}
                  >
                    <Icon icon="lucide:chevron-up" className="h-4 w-4" size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="iconGhost"
                    size="auto"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === routeCount - 1}
                    className={ROUTE_MOVE_BUTTON_CLASS}
                    title="Move route down"
                    aria-label={`Move route ${index + 1} down`}
                  >
                    <Icon icon="lucide:chevron-down" className="h-4 w-4" size={16} />
                  </Button>
                  {index > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => applyDurationFromRoute(0, index)}
                    >
                      Copy duration from Route 1
                    </Button>
                  ) : null}
                </span>
              }
              onRemove={
                routeCount > 1 ? () => removeDosageRoute(index) : undefined
              }
              removeLabel={`Remove route ${index + 1}`}
            >
              <EditorFieldRow layout="threeColumn">
                <FormEditorField
                  htmlFor={`${routeKey}-route`}
                  label="Administration route"
                  name={`dosage.routes.${index}.route`}
                >
                  <Input
                    id={`${routeKey}-route`}
                    {...register(`dosage.routes.${index}.route`)}
                    placeholder="e.g., Oral"
                  />
                </FormEditorField>
                <FormEditorField
                  htmlFor={`${routeKey}-bioavailability`}
                  label="Bioavailability"
                  name={`dosage.routes.${index}.bioavailability`}
                >
                  <Input
                    id={`${routeKey}-bioavailability`}
                    {...register(`dosage.routes.${index}.bioavailability`)}
                    placeholder="e.g., 70-80%"
                  />
                </FormEditorField>
                <FormEditorField
                  htmlFor={`${routeKey}-bioavailability-notes`}
                  label="Bioavailability Notes"
                  name={`dosage.routes.${index}.bioavailability_notes`}
                >
                  <Textarea
                    id={`${routeKey}-bioavailability-notes`}
                    {...register(`dosage.routes.${index}.bioavailability_notes`)}
                    placeholder="e.g., Extensive first-pass metabolism"
                    className="min-h-[38px] resize-y"
                  />
                </FormEditorField>
              </EditorFieldRow>
              <div className="space-y-3">
                <p className="theme-text-faint flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
                  <Icon icon="lucide:chart-column-increasing" size={14} className="theme-icon-accent" />
                  Dose Ranges
                </p>
                <EditorFieldRow layout="twoColumn" className="lg:grid-cols-3">
                  {doseRangeLabels.map(([key, label]) => (
                    <FormEditorField
                      key={`${routeKey}-${key}`}
                      htmlFor={`${routeKey}-${key}`}
                      label={label}
                      name={`dosage.routes.${index}.dose_ranges.${key}`}
                    >
                      <DoseRangeStringInput
                        id={`${routeKey}-${key}`}
                        name={`dosage.routes.${index}.dose_ranges.${key}`}
                        placeholder="e.g., 10-20 mg"
                      />
                    </FormEditorField>
                  ))}
                </EditorFieldRow>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="theme-text-faint flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
                    <Icon icon="lucide:chart-line" size={14} className="theme-icon-accent" />
                    Duration Stages
                  </p>
                  <FormEditorField
                    htmlFor={`${routeKey}-half-life`}
                    label="Half-life"
                    className="flex flex-wrap items-center gap-2 space-y-0"
                    name={`duration.routes.${index}.half_life`}
                  >
                    <Input
                      id={`${routeKey}-half-life`}
                      {...register(`duration.routes.${index}.half_life`)}
                      placeholder="e.g., 3-6 hours"
                      inputSize="sm"
                      className="w-full md:w-40"
                    />
                  </FormEditorField>
                </div>
                <EditorFieldRow layout="twoColumn" className="lg:grid-cols-3">
                  {durationStageLabels.map(([stageKey, label, placeholder]) => (
                    <FormEditorField
                      key={`${routeKey}-duration-${stageKey}`}
                      htmlFor={`${routeKey}-duration-${stageKey}`}
                      label={label}
                      name={`duration.routes.${index}.stages.${stageKey}`}
                    >
                      <DurationStageStringInput
                        id={`${routeKey}-duration-${stageKey}`}
                        name={`duration.routes.${index}.stages.${stageKey}`}
                        placeholder={placeholder}
                      />
                    </FormEditorField>
                  ))}
                </EditorFieldRow>
                <FormEditorField
                  htmlFor={`${routeKey}-half-life-notes`}
                  label="Half-life Notes"
                  name={`duration.routes.${index}.half_life_notes`}
                >
                  <Textarea
                    id={`${routeKey}-half-life-notes`}
                    {...register(`duration.routes.${index}.half_life_notes`)}
                    placeholder="e.g., Dose-dependent elimination; CYP2D6 polymorphisms affect half-life"
                    className="min-h-[38px] resize-y"
                  />
                </FormEditorField>
              </div>
              <FormEditorField
                htmlFor={`${routeKey}-notes`}
                label="Route Notes"
                name={`dosage.routes.${index}.notes`}
              >
                <Input
                  id={`${routeKey}-notes`}
                  {...register(`dosage.routes.${index}.notes`)}
                  placeholder="Additional notes for this route"
                />
              </FormEditorField>
              <EditorFieldRow layout="twoColumn">
                <ReferenceIdListInput
                  name={`dosage.routes.${index}.reference_ids` as const}
                  label="Dosage reference IDs"
                  helperText="Primary structured linkage for this dosage table. Prefer one source per route in the current citation workflow."
                  placeholder="url-erowid-2cb"
                />
                <ReferenceIdListInput
                  name={`duration.routes.${index}.reference_ids` as const}
                  label="Duration reference IDs"
                  helperText="Primary structured linkage for this duration table. Prefer one source per route in the current citation workflow."
                  placeholder="pmid-12345"
                />
              </EditorFieldRow>
            </EntryCard>
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
