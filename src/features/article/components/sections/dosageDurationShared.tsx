import { useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
// Imported from the module rather than from `@/data/schema` on purpose: the
// registry barrel drags the dev-tools field registry into whatever imports it,
// and this file renders on the public article.
import {
  doseRangeTransformer,
  durationStageTransformer,
} from "@/data/schema/transformers";
import { cn } from "@/lib/utils";
import type { DosageRoute, DurationRoute, DoseRange, DurationStage, SubstanceArticle } from "@/schema";
import { EditableValue, useArticleEdit } from "../../editing";
import { CitationMarker, CitedText } from "../CitedText";
import { normalizeDurationStageForDisplay } from "./durationUnits";

export function formatDose(range: DoseRange | null, isThreshold = false): string {
  if (!range || (range.min === null && range.max === null)) return "N/A";
  if (range.min !== null && range.max !== null) {
    if (range.min === range.max) {
      return `${range.min} ${range.unit}`;
    }
    return `${range.min}-${range.max} ${range.unit}`;
  }
  if (range.min !== null) {
    return isThreshold ? `~${range.min} ${range.unit}` : `${range.min}+ ${range.unit}`;
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
export function formatDuration(stage: DurationStage | null): string {
  if (!stage || (stage.min === null && stage.max === null)) return "N/A";
  const { min, max, unit } = normalizeDurationStageForDisplay(stage);
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

function capitalizeRoute(route: string): string {
  return route.charAt(0).toUpperCase() + route.slice(1);
}

const ROUTE_LABELS: Record<string, string> = {
  iv: "IV",
  intravenous: "Intravenous",
  im: "IM",
  intramuscular: "Intramuscular",
  "i.m.": "IM",
  "iv/im": "IV/IM",
};

export function formatRouteLabel(route: string): string {
  return ROUTE_LABELS[route.toLowerCase()] ?? capitalizeRoute(route);
}

export const ROUTE_ICONS: Record<string, IconName> = {
  oral: "healthicons:stomach-outline-24px",
  insufflated: "mingcute:nose-line",
  intranasal: "mingcute:nose-line",
  snorted: "mingcute:nose-line",
  iv: "fluent:syringe-24-regular",
  intravenous: "fluent:syringe-24-regular",
  im: "fluent:syringe-24-regular",
  intramuscular: "fluent:syringe-24-regular",
  "i.m.": "fluent:syringe-24-regular",
  "iv/im": "fluent:syringe-24-regular",
  injection: "fluent:syringe-24-regular",
  transdermal: "fluent:syringe-24-regular",
  smoked: "tabler:lungs",
  inhaled: "tabler:lungs",
  vaporized: "tabler:lungs",
  sublingual: "hugeicons:tongue",
  rectal: "custom:rectal",
  buccal: "la:teeth-open",
};

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

const DOSE_TIERS = [
  { key: "threshold", label: "Threshold" },
  { key: "light", label: "Light" },
  { key: "moderate", label: "Moderate" },
  { key: "strong", label: "Strong" },
  { key: "heavy", label: "Heavy" },
] as const;

const DURATION_STAGES = [
  { key: "onset", label: "Onset" },
  { key: "come_up", label: "Come Up" },
  { key: "peak", label: "Peak" },
  { key: "offset", label: "Offset" },
  { key: "after_effects", label: "After Effects" },
  { key: "total_duration", label: "Total" },
] as const;

function ExpandableNoteRow({
  ariaLabelBase,
  article,
  label,
  panelId,
  value,
  valuePath,
  valueEmptyLabel,
  notes,
  notesPath,
  notesEmptyLabel,
}: {
  ariaLabelBase: string;
  article: SubstanceArticle;
  label: string;
  panelId: string;
  value: string;
  /**
   * Field path of the headline value (`bioavailability`, `half_life`).
   * Optional: absent wherever the route's index is unknown, and inert outside
   * an editing surface, so the public row is untouched either way.
   */
  valuePath?: string;
  valueEmptyLabel?: string;
  notes?: string | null;
  /** Field path of the note body; the whole note is one field, not one per line. */
  notesPath?: string;
  notesEmptyLabel?: string;
}) {
  const editing = useArticleEdit();
  const [expanded, setExpanded] = useState(false);
  const hasNotes = !!notes?.trim();
  // An absent note draws no expand button, which makes the missing note the one
  // thing a reviewer could never add from the page. Inside an editing surface
  // the toggle stays, and opens onto the placeholder instead of onto nothing.
  const canEditNotes = editing !== null && !!notesPath;
  const showToggle = hasNotes || canEditNotes;
  const showPanel = expanded && showToggle;

  const noteLines = (
    <ul className="space-y-1">
      {(notes ?? "")
        .split("\n")
        .filter((line) => line.trim())
        .map((line, index) => (
          <li key={index} className="theme-text-muted flex gap-2 text-xs leading-relaxed">
            <span className="theme-accent-emphasis select-none">•</span>
            <span><CitedText text={line.replace(/^[•\-*]\s*/, "").trim()} article={article} /></span>
          </li>
        ))}
    </ul>
  );

  return (
    <div className="mt-3">
      <div className={cn("theme-dose-detail-shell overflow-hidden rounded-lg", showPanel && "ring-1 ring-[var(--theme-frosted-control-on-panel-hover-border)]")}>
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
                  <CitedText text={value} article={article} />
                </EditableValue>
              ) : (
                <CitedText text={value} article={article} />
              )}
            </span>
            {showToggle && (
              <ExpandButton
                isExpanded={expanded}
                onToggle={() => setExpanded(!expanded)}
                variant="inline"
                className="theme-text-muted"
                ariaLabel={expanded ? `Collapse ${ariaLabelBase} notes` : `Expand ${ariaLabelBase} notes`}
                ariaControls={panelId}
              />
            )}
          </div>
        </div>
        {showPanel && (
          <div id={panelId} className="theme-dose-detail-expanded px-3 py-2">
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
  article,
}: {
  route: DosageRoute;
  /**
   * Index of `route` in `article.dosage.routes` — what an inline edit addresses.
   * Optional so any other caller can render the table without one; supplying it
   * changes nothing on its own, since the edit context is what opens the
   * affordance.
   */
  routeIndex?: number;
  article: SubstanceArticle;
}) {
  const editing = useArticleEdit();
  const hasNotes = !!route.notes?.trim();
  const routeId = route.route.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const routeLabel = formatRouteLabel(route.route);
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
          const range = route.dose_ranges[key as keyof typeof route.dose_ranges];
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
                <span className="theme-text-secondary font-medium">{label}</span>
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
          article={article}
          ariaLabelBase={`${routeLabel} bioavailability`}
          label="Bioavailability"
          notes={route.bioavailability_notes}
          notesEmptyLabel="Add bioavailability notes"
          notesPath={routePath ? `${routePath}.bioavailability_notes` : undefined}
          panelId={`dosage-${routeId}-bioavailability-notes`}
          value={route.bioavailability ?? ""}
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
                <CitedText text={route.notes} article={article} />
              </EditableValue>
            ) : (
              <CitedText text={route.notes} article={article} />
            )}
          </p>
        </div>
      ) : null}
    </>
  );
}

export function DurationPanel({
  route,
  routeIndex,
  article,
}: {
  route: DurationRoute;
  /**
   * Index of `route` in `article.duration.routes`. Duration routes are grouped
   * under a canonical tab name exactly like dosage routes, so the rendered
   * route is not `routes[0]` and cannot be found by position afterwards.
   * Optional, and inert without an edit context.
   */
  routeIndex?: number;
  article: SubstanceArticle;
}) {
  const editing = useArticleEdit();
  const routeId = route.route.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const routeLabel = formatRouteLabel(route.route);
  const routePath =
    typeof routeIndex === "number" ? `duration.routes[${routeIndex}]` : null;
  const canEdit = editing !== null && routePath !== null;

  return (
    <div className="theme-dose-duration-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="theme-text-primary flex items-center gap-2 text-sm font-semibold">
          <Icon icon="lucide:chart-line" size={20} className="theme-accent-emphasis" />
          Duration
          <CitationMarker article={article} referenceIds={route.reference_ids} />
        </h3>
      </div>
      <div className="space-y-1.5">
        {DURATION_STAGES.map(({ key, label }) => {
          const stage = route.stages[key as keyof typeof route.stages];
          const value = formatDuration(stage);
          if (value === "N/A" && !canEdit) return null;
          return (
            <div
              key={key}
              className="theme-duration-stage-row flex items-center justify-between rounded-lg px-3 py-1.5 text-sm"
            >
              <span className="theme-text-secondary font-medium">{label}</span>
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
          article={article}
          ariaLabelBase={`${routeLabel} half-life`}
          label="Half-life"
          notes={route.half_life_notes}
          notesEmptyLabel="Add half-life notes"
          notesPath={routePath ? `${routePath}.half_life_notes` : undefined}
          panelId={`duration-${routeId}-half-life-notes`}
          value={route.half_life ?? ""}
          valueEmptyLabel="Add half-life"
          valuePath={routePath ? `${routePath}.half_life` : undefined}
        />
      ) : null}
    </div>
  );
}
