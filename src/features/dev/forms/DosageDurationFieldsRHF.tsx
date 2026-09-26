/**
 * RHF-based Dosage and Duration fields component.
 * Uses useFieldArray for route management.
 *
 * Doses are safety-critical, so each route says, while it is being typed:
 * which unit its tiers use (and which tier broke the one-unit rule), a tier
 * out of order, a stage longer than the whole experience, and beside every
 * changed value what readers see now ("Live: 50-150 ug"). Removing a route
 * asks first, naming what goes with it.
 */

import { useCallback, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Icon } from "@/components/common/Icon";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorFieldRow, useConfirm } from "@/features/dev/components";
import { formatDose } from "@/features/article/components/sections/dosageDurationModel";
import { cn } from "@/lib/utils";

import { useArticleFormContext } from "./ArticleFormContext";
import { FormEditorField } from "./FormEditorField";
import { EntryCard } from "./EntryCard";
import { DoseRangeStringInput, DurationStageStringInput, ReferenceIdListInput } from "./rhf";
import { usePublishedArticle } from "./PublishedArticleContext";
import {
  DOSE_TIERS,
  DURATION_STAGES,
  doseJumpChecks,
  doseRangeChecks,
  doseUnits,
  durationStageChecks,
  listWords,
  type RangeValue,
  type RouteCheck,
} from "./doseRouteChecks";
import type { SubstanceArticle } from "@/schema";

/** Placeholders read like the public table, one per stage. */
const DURATION_PLACEHOLDERS: Record<(typeof DURATION_STAGES)[number][0], string> = {
  onset: "e.g., 15-30 minutes",
  come_up: "e.g., 30-60 minutes",
  peak: "e.g., 2-3 hours",
  offset: "e.g., 1-2 hours",
  after_effects: "e.g., 1-2 hours",
  total_duration: "e.g., 6-8 hours",
};

const ROUTE_MOVE_BUTTON_CLASS =
  `theme-text-faint h-8 w-8 rounded-md p-1 hover:bg-transparent disabled:opacity-30 disabled:cursor-not-allowed ${TOUCH_ICON}`;

export type DosageDurationFieldsRHFProps = {
  idPrefix: string;
};

function routeNameOf(value: unknown, index: number): string {
  return typeof value === "string" && value.trim() ? value.trim() : `Route ${index + 1}`;
}

/**
 * Card titles follow the route name the editor typed, because the card order is
 * the public tab order and a positional label makes reordering unreadable.
 */
function RouteCardTitle({ index }: { index: number }) {
  const routeName = useWatch<SubstanceArticle>({
    name: `dosage.routes.${index}.route`,
  });
  return <>{routeNameOf(routeName, index)}</>;
}

/** The published route this card edits, matched by name (the order may have moved), or null for a new route. */
function usePublishedRoute(index: number) {
  const published = usePublishedArticle();
  const routeName = useWatch<SubstanceArticle>({ name: `dosage.routes.${index}.route` });
  if (!published) return { known: false as const, dosage: null, duration: null };
  const key = typeof routeName === "string" ? routeName.trim().toLowerCase() : "";
  const dosage = published.dosage?.routes?.find((route) => (route.route ?? "").trim().toLowerCase() === key) ?? null;
  const duration = published.duration?.routes?.find((route) => (route.route ?? "").trim().toLowerCase() === key) ?? null;
  return { known: true as const, dosage, duration };
}

function sameRange(a: RangeValue, b: RangeValue): boolean {
  const norm = (range: RangeValue) => ({ min: range?.min ?? null, max: range?.max ?? null, unit: (range?.unit ?? "").trim() });
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function asRange(range: RangeValue) {
  return { min: range?.min ?? null, max: range?.max ?? null, unit: range?.unit ?? "" };
}

/** "Live: 50-150 ug" under a value that differs from what readers see, or "Not live yet" on a new route. */
function LiveValue({ index, name, current, published, isThreshold = false }: {
  index: number; name: string; current: RangeValue; published: RangeValue | undefined | null; isThreshold?: boolean;
}) {
  const route = usePublishedRoute(index);
  if (!route.known) return null;
  if (sameRange(current, published)) return null;
  const hasLive = !!published && (published.min != null || published.max != null);
  return (
    <p className="theme-text-muted mt-1 flex items-center gap-1.5 text-xs" data-live-value={name}>
      <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
      {hasLive ? <>Live: <span className="tabular-nums">{formatDose(asRange(published), isThreshold)}</span></> : "Not on the live page yet"}
    </p>
  );
}

function DoseTierField({ index, routeKey, tier, label }: { index: number; routeKey: string; tier: (typeof DOSE_TIERS)[number][0]; label: string }) {
  const current = useWatch<SubstanceArticle>({ name: `dosage.routes.${index}.dose_ranges.${tier}` }) as RangeValue;
  const route = usePublishedRoute(index);
  return (
    <FormEditorField
      htmlFor={`${routeKey}-${tier}`}
      label={label}
      name={`dosage.routes.${index}.dose_ranges.${tier}`}
    >
      <DoseRangeStringInput
        id={`${routeKey}-${tier}`}
        name={`dosage.routes.${index}.dose_ranges.${tier}`}
        placeholder={tier === "threshold" ? "e.g., 10 mg" : "e.g., 10-20 mg"}
      />
      <LiveValue index={index} name={tier} current={current} published={route.dosage?.dose_ranges?.[tier] as RangeValue} isThreshold={tier === "threshold"} />
    </FormEditorField>
  );
}

function DurationStageField({ index, routeKey, stage, label }: { index: number; routeKey: string; stage: (typeof DURATION_STAGES)[number][0]; label: string }) {
  const current = useWatch<SubstanceArticle>({ name: `duration.routes.${index}.stages.${stage}` }) as RangeValue;
  const route = usePublishedRoute(index);
  return (
    <FormEditorField
      htmlFor={`${routeKey}-duration-${stage}`}
      label={label}
      name={`duration.routes.${index}.stages.${stage}`}
    >
      <DurationStageStringInput
        id={`${routeKey}-duration-${stage}`}
        name={`duration.routes.${index}.stages.${stage}`}
        placeholder={DURATION_PLACEHOLDERS[stage]}
      />
      <LiveValue index={index} name={stage} current={current} published={route.duration?.stages?.[stage] as RangeValue} />
    </FormEditorField>
  );
}

/** Warnings and blockers under a group, read from the committed values (fields commit on blur). */
function RouteChecks({ checks }: { checks: RouteCheck[] }) {
  return (
    <div role="status" aria-live="polite">
      {checks.length > 0 ? (
        <ul className="space-y-1.5">
          {checks.map((check) => (
            <li key={check.message} className={cn("flex items-start gap-2 text-sm", check.tone === "danger" ? "theme-danger-text" : "theme-warning-text")}>
              <Icon icon={check.tone === "danger" ? "lucide:octagon-alert" : "lucide:triangle-alert"} size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>{check.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DoseUnitLine({ index }: { index: number }) {
  const ranges = useWatch<SubstanceArticle>({ name: `dosage.routes.${index}.dose_ranges` }) as Parameters<typeof doseUnits>[0];
  const units = doseUnits(ranges);
  if (units.length === 0) return <p className="theme-text-faint text-xs">No dose entered yet. Type a range with its unit, like 10-20 mg.</p>;
  if (units.length === 1) return <p className="theme-text-faint text-xs">Every tier is in <span className="theme-text-secondary font-medium">{units[0].unit}</span>. Keep new values in the same unit.</p>;
  return null;
}

function DoseChecks({ index }: { index: number }) {
  const ranges = useWatch<SubstanceArticle>({ name: `dosage.routes.${index}.dose_ranges` }) as Parameters<typeof doseRangeChecks>[0];
  const route = usePublishedRoute(index);
  return <RouteChecks checks={[...doseRangeChecks(ranges), ...doseJumpChecks(ranges, route.dosage?.dose_ranges as Parameters<typeof doseJumpChecks>[1])]} />;
}

function DurationChecks({ index }: { index: number }) {
  const stages = useWatch<SubstanceArticle>({ name: `duration.routes.${index}.stages` }) as Parameters<typeof durationStageChecks>[0];
  return <RouteChecks checks={durationStageChecks(stages)} />;
}

function NewRouteLine({ index }: { index: number }) {
  const route = usePublishedRoute(index);
  if (!route.known || route.dosage) return null;
  return <p className="theme-text-muted text-xs">This route is not on the live page yet, or its name changed.</p>;
}

function CopyDurationStages({ index }: { index: number }) {
  const { applyDurationFromRoute } = useArticleFormContext();
  const source = useWatch<SubstanceArticle>({ name: "dosage.routes.0.route" });
  const destination = useWatch<SubstanceArticle>({ name: `dosage.routes.${index}.route` });
  const { confirm, dialog } = useConfirm();
  const [copied, setCopied] = useState(false);
  const sourceName = routeNameOf(source, 0);
  const destinationName = routeNameOf(destination, index);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-auto max-w-full whitespace-normal text-left"
        onClick={() =>
          confirm({
            title: `Replace duration stages for ${destinationName}?`,
            description: `Copy all six duration stages from ${sourceName}, replacing this route's current stages. Half-life, notes, and reference IDs stay unchanged.`,
            confirmLabel: "Replace duration stages",
            onConfirm: () => {
              applyDurationFromRoute(0, index);
              setCopied(true);
            },
          })
        }
      >
        <Icon icon="lucide:copy" size={14} aria-hidden />
        Copy duration stages from {sourceName}
      </Button>
      {dialog}
      {copied && <p role="status" className="theme-text-muted text-sm">Duration stages copied. Half-life, notes, and reference IDs are unchanged.</p>}
    </div>
  );
}

const GROUP_LEGEND = "theme-text-primary flex items-center gap-1.5 text-sm font-semibold";

export function DosageDurationFieldsRHF({ idPrefix }: DosageDurationFieldsRHFProps) {
  const { register, setFocus, getValues } = useFormContext<SubstanceArticle>();
  const {
    dosageRoutes,
    addDosageRoute,
    removeDosageRoute,
    moveDosageRoute,
    renameDosageRoute,
  } = useArticleFormContext();
  const { confirm, dialog } = useConfirm();

  const routeCount = dosageRoutes.fields.length;

  const handleMoveUp = useCallback((index: number) => {
    if (index > 0) {
      moveDosageRoute(index, index - 1);
      requestAnimationFrame(() => setFocus(`dosage.routes.${index - 1}.route`));
    }
  }, [moveDosageRoute, setFocus]);

  const handleMoveDown = useCallback((index: number) => {
    if (index < routeCount - 1) {
      moveDosageRoute(index, index + 1);
      requestAnimationFrame(() => setFocus(`dosage.routes.${index + 1}.route`));
    }
  }, [moveDosageRoute, routeCount, setFocus]);

  const requestRemove = (index: number) => {
    const name = routeNameOf(getValues(`dosage.routes.${index}.route`), index);
    const filled = DOSE_TIERS.filter(([tier]) => {
      const range = getValues(`dosage.routes.${index}.dose_ranges.${tier}`) as RangeValue;
      return range?.min != null || range?.max != null;
    }).map(([, label]) => label.toLowerCase());
    confirm({
      title: `Remove ${name}?`,
      description: `${filled.length > 0 ? `Its ${listWords(filled)} doses` : "Its dose ranges"}, duration stages, half-life, bioavailability, notes and reference IDs go with it. Nothing leaves this browser until you publish or submit.`,
      confirmLabel: `Remove ${name}`,
      destructive: true,
      onConfirm: () => {
        removeDosageRoute(index);
        requestAnimationFrame(() => setFocus(`dosage.routes.${Math.max(0, index - 1)}.route`));
      },
    });
  };

  const addRoute = () => {
    addDosageRoute();
    requestAnimationFrame(() => setFocus(`dosage.routes.${routeCount}.route`));
  };

  return (
    <section className="space-y-6">
      <p className="theme-text-muted max-w-prose text-sm">
        Type each range with its unit, like 10-20 mg, 10+ mg, ~10 mg or &lt;20 mg. Values are checked when you leave a field;
        a changed value shows what readers see now under it.
      </p>
      <div className="space-y-4">
        {dosageRoutes.fields.map((field, index) => {
          const routeKey = `${idPrefix}-route-${index}`;
          return (
            <div key={field.id} role="group" aria-labelledby={`${routeKey}-title`}>
            <EntryCard
              title={<span id={`${routeKey}-title`}><RouteCardTitle index={index} /></span>}
              bodyClassName="space-y-5"
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
                </span>
              }
              onRemove={
                routeCount > 1 ? () => requestRemove(index) : undefined
              }
              removeLabel={`Remove route ${index + 1}`}
            >
              <NewRouteLine index={index} />
              <EditorFieldRow layout="threeColumn">
                <FormEditorField
                  htmlFor={`${routeKey}-route`}
                  label="Administration route"
                  name={`dosage.routes.${index}.route`}
                >
                  <Input
                    id={`${routeKey}-route`}
                    {...register(`dosage.routes.${index}.route`)}
                    onChange={(event) => renameDosageRoute(index, event.target.value)}
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
                  label="Bioavailability notes"
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
              <fieldset className="min-w-0 space-y-3">
                <legend className={GROUP_LEGEND}>
                  <Icon icon="lucide:chart-column-increasing" size={15} className="theme-icon-accent" aria-hidden />
                  Dose ranges
                </legend>
                <DoseUnitLine index={index} />
                <EditorFieldRow layout="twoColumn" className="lg:grid-cols-3">
                  {DOSE_TIERS.map(([tier, label]) => (
                    <DoseTierField key={`${routeKey}-${tier}`} index={index} routeKey={routeKey} tier={tier} label={label} />
                  ))}
                </EditorFieldRow>
                <DoseChecks index={index} />
              </fieldset>
              <fieldset className="min-w-0 space-y-3">
                <legend className={GROUP_LEGEND}>
                  <Icon icon="lucide:chart-line" size={15} className="theme-icon-accent" aria-hidden />
                  Duration
                </legend>
                {index > 0 && <CopyDurationStages index={index} />}
                <EditorFieldRow layout="twoColumn" className="lg:grid-cols-3">
                  {DURATION_STAGES.map(([stage, label]) => (
                    <DurationStageField key={`${routeKey}-duration-${stage}`} index={index} routeKey={routeKey} stage={stage} label={label} />
                  ))}
                </EditorFieldRow>
                <DurationChecks index={index} />
                <EditorFieldRow layout="twoColumn">
                  <FormEditorField
                    htmlFor={`${routeKey}-half-life`}
                    label="Half-life"
                    name={`duration.routes.${index}.half_life`}
                  >
                    <Input
                      id={`${routeKey}-half-life`}
                      {...register(`duration.routes.${index}.half_life`)}
                      placeholder="e.g., 3-6 hours"
                    />
                  </FormEditorField>
                  <FormEditorField
                    htmlFor={`${routeKey}-half-life-notes`}
                    label="Half-life notes"
                    name={`duration.routes.${index}.half_life_notes`}
                  >
                    <Textarea
                      id={`${routeKey}-half-life-notes`}
                      {...register(`duration.routes.${index}.half_life_notes`)}
                      placeholder="e.g., Dose-dependent elimination; CYP2D6 polymorphisms affect half-life"
                      className="min-h-[38px] resize-y"
                    />
                  </FormEditorField>
                </EditorFieldRow>
              </fieldset>
              <FormEditorField
                htmlFor={`${routeKey}-notes`}
                label="Route notes"
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
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={addRoute}
      >
        <Icon icon="lucide:plus" size={16} aria-hidden />
        Add route
      </Button>
      {dialog}
    </section>
  );
}
