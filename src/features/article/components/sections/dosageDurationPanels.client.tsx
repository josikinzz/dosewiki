"use client";

import { useState, type ReactNode } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
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
import { formatDose, formatRouteLabel } from "./dosageDurationModel";

export { formatDose };

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

type EditableBounds = DoseRange & DurationStage;

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
                  label="{{label}}"
                  labelValues={{ label: ariaLabelBase }}
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
              <EditableValue
                as="div"
                emptyLabel={notesEmptyLabel}
                label="{{label}} notes"
                labelValues={{ label: ariaLabelBase }}
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
  const routePath =
    typeof routeIndex === "number" ? `dosage.routes[${routeIndex}]` : null;
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
                      emptyLabel="Add {{tier}} dose"
                      format={doseRangeTransformer.toForm}
                      label="{{route}} {{tier}} dose"
                      labelValues={{
                        route: routeLabel,
                        tier: t(label).toLowerCase(),
                      }}
                      parse={doseRangeTransformer.toSchema}
                      parseErrorLabel={DOSE_PARSE_ERROR}
                      citeHint="Cite this dose in the route notes."
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
          value={route.bioavailability ?? ""}
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
                label="{{route}} dosage notes"
                labelValues={{ route: routeLabel }}
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
                    emptyLabel="Add {{stage}} duration"
                    format={durationStageTransformer.toForm}
                    label="{{route}} {{stage}} duration"
                    labelValues={{
                      route: routeLabel,
                      stage: t(label).toLowerCase(),
                    }}
                    parse={durationStageTransformer.toSchema}
                    parseErrorLabel={DURATION_PARSE_ERROR}
                    citeHint="Cite this duration in the route notes."
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
