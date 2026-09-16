"use client";

import { useState, type ReactNode } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
// Imported from the module rather than from `@/data/schema` on purpose: the
// registry barrel drags the dev-tools field registry into whatever imports it,
// and this file renders on the public article.
import {
  doseRangeTransformer,
  durationStageTransformer,
} from "@/data/schema/transformers";
import { cn } from "@/lib/utils";
import type {
  DosageRoute,
  DurationRoute,
  DoseRange,
  DurationStage,
} from "@/schema";
import { useT } from "@/i18n/client";
import type { Translate } from "@/i18n/messages";
import { EditableValue, useArticleEdit } from "../../editing";
import { DOSE_TIERS, DURATION_STAGES } from "./dosageDurationLabels";
import { normalizeDurationStageForDisplay } from "./durationUnits";
import { formatRouteLabel } from "./dosageDurationModel";

export function formatDose(
  range: DoseRange | null,
  isThreshold = false,
): string {
  if (!range || (range.min === null && range.max === null)) return "N/A";
  if (range.min !== null && range.max !== null) {
    if (range.min === range.max) {
      return `${range.min} ${range.unit}`;
    }
    return `${range.min}-${range.max} ${range.unit}`;
  }
  if (range.min !== null) {
    return isThreshold
      ? `~${range.min} ${range.unit}`
      : `${range.min}+ ${range.unit}`;
  }
  return `${range.max} ${range.unit}`;
}

/**
 * Display only. The stage is normalized to a sensible time unit first — see
 * `normalizeDurationStageForDisplay` for the thresholds — so a stored
 * `120-420 minutes` prints as `2-7 hours` next to the hour rows it sits beside.
 * The stored triple is never changed, and `formatDose` is deliberately not
 * routed through this: dose units must never be converted.
 */
export function formatDuration(
  t: Translate,
  stage: DurationStage | null,
): string {
  if (!stage || (stage.min === null && stage.max === null)) return "N/A";
  const { min, max, unit } = normalizeDurationStageForDisplay(t, stage);
  if (min !== null && max !== null) {
    if (min === max) {
      return `${min} ${unit}`;
    }
    return `${min}-${max} ${unit}`;
  }
  if (min !== null) {
    return `${min}+ ${unit}`;
  }
  return `${max} ${unit}`;
}

/**
 * A dose tier and a duration stage are the same `{min, max, unit}` leaf, so one
 * helper and one `EditableValue` instantiation serve both panels.
 */
type EditableBounds = DoseRange & DurationStage;

/**
 * The exact `{min, max, unit}` triple the inline-edit write path validates.
 *
 * Two reasons this is not just the stored object. A tier can be absent
 * entirely, and the editor still has to offer it — `expected` then has to spell
 * the absence the way the server reads it (`{min: null, max: null, unit: ""}`)
 * or the conflict check rejects the very edit that fills the gap. And a legacy
 * row may carry extra keys, which the strict range guard refuses as an
 * `expected` value, stranding exactly the data most in need of correction.
 *
 * Never derived from `formatDose`/`formatDuration`: those renders are lossy —
 * a threshold prints `~10 mg` and a max-only range prints a bare `20 mg` that
 * reads back as `{min: 20, max: 20}` — so the editor seed comes from the
 * transformer instead.
 */
function toEditableRange(
  range: DoseRange | DurationStage | null | undefined,
): EditableBounds {
  return {
    min: range?.min ?? null,
    max: range?.max ?? null,
    unit: range?.unit ?? "",
  };
}

const DOSE_PARSE_ERROR = "Enter a dose like 10-20 mg, 10+ mg, or <20 mg.";
const DURATION_PARSE_ERROR =
  "Enter a duration like 30-60 minutes, 2+ hours, or <30 minutes.";

function ExpandableNoteRow({
  ariaLabelBase,
  label,
  panelId,
  value,
  valueContent,
  valuePath,
  valueEmptyLabel,
  notes,
  notesContent,
  notesPath,
  notesEmptyLabel,
}: {
  ariaLabelBase: string;
  label: string;
  panelId: string;
  value: string;
  valueContent: ReactNode;
  valuePath?: string;
  valueEmptyLabel?: string;
  notes?: string | null;
  notesContent: ReactNode;
  notesPath?: string;
  notesEmptyLabel?: string;
}) {
  const t = useT();
  const editing = useArticleEdit();
  const [expanded, setExpanded] = useState(false);
  const hasNotes = !!notes?.trim();
  // An absent note draws no expand button, which makes the missing note the one
  // thing a reviewer could never add from the page. Inside an editing surface
  // the toggle stays, and opens onto the placeholder instead of onto nothing.
  const canEditNotes = editing !== null && !!notesPath;
  const showToggle = hasNotes || canEditNotes;
  const showPanel = expanded && showToggle;

  const noteLines = notesContent;

  return (
    <div className="mt-3">
      <div
        className={cn(
          "theme-dose-detail-shell overflow-hidden rounded-lg",
          showPanel &&
            "ring-1 ring-[var(--theme-frosted-control-on-panel-hover-border)]",
        )}
      >
        <div
          className={cn(
            "theme-dose-detail-row relative flex items-center justify-between rounded-lg px-3 py-1.5 text-sm",
            showPanel && "rounded-b-none",
          )}
        >
          <span className="theme-accent-emphasis font-medium">{label}</span>
          <div className="flex items-center gap-1">
            <span className="theme-text-secondary font-mono text-xs">
              {valuePath ? (
                <EditableValue
                  emptyLabel={valueEmptyLabel}
                  label={ariaLabelBase}
                  path={valuePath}
                  value={value}
                >
                  {valueContent}
                </EditableValue>
              ) : (
                valueContent
              )}
            </span>
            {showToggle && (
              <ExpandButton
                isExpanded={expanded}
                onToggle={() => setExpanded(!expanded)}
                variant="inline"
                className="theme-text-muted"
                ariaLabel={
                  expanded
                    ? t("Collapse {{label}} notes", { label: ariaLabelBase })
                    : t("Expand {{label}} notes", { label: ariaLabelBase })
                }
                ariaControls={panelId}
              />
            )}
          </div>
        </div>
        {showToggle && (
          <div
            id={panelId}
            hidden={!showPanel}
            className={cn(
              "theme-dose-detail-expanded px-3 py-2",
              showPanel && "theme-reveal-enter",
            )}
          >
            {notesPath ? (
              // One editor for the whole note. Wrapping each `<li>` would let a
              // reviewer save a line back over the field that holds every line.
              <EditableValue
                as="div"
                emptyLabel={notesEmptyLabel}
                label={`${ariaLabelBase} notes`}
                path={notesPath}
                value={notes ?? ""}
              >
                {noteLines}
              </EditableValue>
            ) : (
              noteLines
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function DoseTiersTable({
  route,
  routeIndex,
  bioavailabilityContent,
  bioavailabilityNotesContent,
  notesContent,
}: {
  route: DosageRoute;
  routeIndex?: number;
  bioavailabilityContent: ReactNode;
  bioavailabilityNotesContent: ReactNode;
  notesContent: ReactNode;
}) {
  const t = useT();
  const editing = useArticleEdit();
  const hasNotes = !!route.notes?.trim();
  const routeId = route.route.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const routeLabel = formatRouteLabel(t, route.route);
  // Every path here is anchored on the route's position in the source array,
  // which is the only thing that survives the canonical-name grouping the tabs
  // do. Without an index there is nothing to address, so the table renders
  // exactly as the public page draws it.
  const routePath =
    typeof routeIndex === "number" ? `dosage.routes[${routeIndex}]` : null;
  // Empty rows exist only for a reviewer to fill in. Outside an editing surface
  // an absent tier keeps rendering nothing at all.
  const canEdit = editing !== null && routePath !== null;

  return (
    <>
      <div className="space-y-1.5">
        {DOSE_TIERS.map(({ key, label }) => {
          const range =
            route.dose_ranges[key as keyof typeof route.dose_ranges];
          const value = formatDose(range, key === "threshold");
          if (value === "N/A" && !canEdit) return null;
          return (
            <div
              key={key}
              className="theme-dose-tier-row relative overflow-hidden rounded-lg px-3 py-1.5 text-sm"
            >
              <div
                data-dose-tier={key}
                className="pointer-events-none absolute bottom-0 left-0 top-0 rounded-l-lg"
              />
              <div className="relative flex items-center justify-between">
                <span className="theme-text-secondary font-medium">
                  {t(label)}
                </span>
                <span className="theme-text-muted font-mono text-xs">
                  {canEdit ? (
                    <EditableValue<EditableBounds>
                      emptyLabel={`Add ${label.toLowerCase()} dose`}
                      format={doseRangeTransformer.toForm}
                      label={`${routeLabel} ${label.toLowerCase()} dose`}
                      parse={doseRangeTransformer.toSchema}
                      parseErrorLabel={DOSE_PARSE_ERROR}
                      path={`${routePath}.dose_ranges.${key}`}
                      value={toEditableRange(range)}
                    >
                      {value}
                    </EditableValue>
                  ) : (
                    value
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {route.bioavailability?.trim() || canEdit ? (
        <ExpandableNoteRow
          ariaLabelBase={t("{{route}} bioavailability", { route: routeLabel })}
          label={t("Bioavailability")}
          notes={route.bioavailability_notes}
          notesEmptyLabel="Add bioavailability notes"
          notesPath={
            routePath ? `${routePath}.bioavailability_notes` : undefined
          }
          panelId={`dosage-${routeId}-bioavailability-notes`}
          value={route.bioavailability ? t(route.bioavailability) : ""}
          valueContent={bioavailabilityContent}
          notesContent={bioavailabilityNotesContent}
          valueEmptyLabel="Add bioavailability"
          valuePath={routePath ? `${routePath}.bioavailability` : undefined}
        />
      ) : null}
      {hasNotes || canEdit ? (
        <div className="mt-3">
          <p className="theme-text-muted whitespace-pre-line text-xs">
            {routePath ? (
              <EditableValue
                emptyLabel="Add dosage notes"
                label={`${routeLabel} dosage notes`}
                path={`${routePath}.notes`}
                value={route.notes ?? ""}
              >
                {notesContent}
              </EditableValue>
            ) : (
              notesContent
            )}
          </p>
        </div>
      ) : null}
    </>
  );
}

export interface DurationPanelViewProps {
  route: DurationRoute;
  routeIndex?: number;
  citationMarker: ReactNode;
  halfLifeContent: ReactNode;
  halfLifeNotesContent: ReactNode;
}

export function DurationPanelView({
  route,
  routeIndex,
  citationMarker,
  halfLifeContent,
  halfLifeNotesContent,
}: DurationPanelViewProps) {
  const t = useT();
  const editing = useArticleEdit();
  const routeId = route.route.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const routeLabel = formatRouteLabel(t, route.route);
  const routePath =
    typeof routeIndex === "number" ? `duration.routes[${routeIndex}]` : null;
  const canEdit = editing !== null && routePath !== null;

  return (
    <div className="theme-dose-duration-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="theme-text-primary flex items-center gap-2 text-sm font-semibold">
          <Icon
            icon="lucide:chart-line"
            size={20}
            className="theme-accent-emphasis"
          />
          {t("Duration")}
          {citationMarker}
        </h3>
      </div>
      <div className="space-y-1.5">
        {DURATION_STAGES.map(({ key, label }) => {
          const stage = route.stages[key as keyof typeof route.stages];
          const value = formatDuration(t, stage);
          if (value === "N/A" && !canEdit) return null;
          return (
            <div
              key={key}
              className="theme-duration-stage-row flex items-center justify-between rounded-lg px-3 py-1.5 text-sm"
            >
              <span className="theme-text-secondary font-medium">
                {t(label)}
              </span>
              <span className="theme-text-muted font-mono text-xs">
                {canEdit ? (
                  <EditableValue<EditableBounds>
                    emptyLabel={`Add ${label.toLowerCase()} duration`}
                    format={durationStageTransformer.toForm}
                    label={`${routeLabel} ${label.toLowerCase()} duration`}
                    parse={durationStageTransformer.toSchema}
                    parseErrorLabel={DURATION_PARSE_ERROR}
                    path={`${routePath}.stages.${key}`}
                    value={toEditableRange(stage)}
                  >
                    {value}
                  </EditableValue>
                ) : (
                  value
                )}
              </span>
            </div>
          );
        })}
      </div>
      {route.half_life?.trim() || canEdit ? (
        <ExpandableNoteRow
          ariaLabelBase={t("{{route}} half-life", { route: routeLabel })}
          label={t("Half-life")}
          notes={route.half_life_notes}
          notesEmptyLabel="Add half-life notes"
          notesPath={routePath ? `${routePath}.half_life_notes` : undefined}
          panelId={`duration-${routeId}-half-life-notes`}
          value={route.half_life ?? ""}
          valueContent={halfLifeContent}
          notesContent={halfLifeNotesContent}
          valueEmptyLabel="Add half-life"
          valuePath={routePath ? `${routePath}.half_life` : undefined}
        />
      ) : null}
    </div>
  );
}
