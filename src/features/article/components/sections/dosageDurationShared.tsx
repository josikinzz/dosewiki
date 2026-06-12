import { useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import type { DosageRoute, DurationRoute, DoseRange, DurationStage, SubstanceArticle } from "@/schema";
import { CitationMarker, CitedText } from "../CitedText";

export function formatDose(range: DoseRange | null, isThreshold = false): string {
  if (!range || (range.min === null && range.max === null)) return "N/A";
  if (range.min !== null && range.max !== null) {
    return `${range.min}-${range.max} ${range.unit}`;
  }
  if (range.min !== null) {
    return isThreshold ? `~${range.min} ${range.unit}` : `${range.min}+ ${range.unit}`;
  }
  return `${range.max} ${range.unit}`;
}

export function formatDuration(stage: DurationStage | null): string {
  if (!stage || (stage.min === null && stage.max === null)) return "N/A";
  if (stage.min !== null && stage.max !== null) {
    return `${stage.min}-${stage.max} ${stage.unit}`;
  }
  if (stage.min !== null) {
    return `${stage.min}+ ${stage.unit}`;
  }
  return `${stage.max} ${stage.unit}`;
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
  notes,
}: {
  ariaLabelBase: string;
  article: SubstanceArticle;
  label: string;
  panelId: string;
  value: string;
  notes?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasNotes = !!notes?.trim();

  return (
    <div className="mt-3">
      <div className={cn("theme-dose-detail-shell overflow-hidden rounded-lg", expanded && "ring-1 ring-[var(--theme-frosted-control-on-panel-hover-border)]")}>
        <div
          className={cn(
            "theme-dose-detail-row relative flex items-center justify-between rounded-lg px-3 py-1.5 text-sm",
            expanded && "rounded-b-none",
          )}
        >
          <span className="theme-accent-emphasis font-medium">{label}</span>
          <div className="flex items-center gap-1">
            <span className="theme-text-secondary font-mono text-xs">
              <CitedText text={value} article={article} />
            </span>
            {hasNotes && (
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
        {expanded && hasNotes && (
          <div id={panelId} className="theme-dose-detail-expanded px-3 py-2">
            <ul className="space-y-1">
              {notes!
                .split("\n")
                .filter((line) => line.trim())
                .map((line, index) => (
                  <li key={index} className="theme-text-muted flex gap-2 text-xs leading-relaxed">
                    <span className="theme-accent-emphasis select-none">•</span>
                    <span><CitedText text={line.replace(/^[•\-*]\s*/, "").trim()} article={article} /></span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function DoseTiersTable({ route, article }: { route: DosageRoute; article: SubstanceArticle }) {
  const hasNotes = !!route.notes?.trim();
  const routeId = route.route.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const routeLabel = formatRouteLabel(route.route);

  return (
    <>
      <div className="space-y-1.5">
        {DOSE_TIERS.map(({ key, label }) => {
          const range = route.dose_ranges[key as keyof typeof route.dose_ranges];
          const value = formatDose(range, key === "threshold");
          if (value === "N/A") return null;
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
                <span className="theme-text-muted font-mono text-xs">{value}</span>
              </div>
            </div>
          );
        })}
      </div>
      {route.bioavailability?.trim() ? (
        <ExpandableNoteRow
          article={article}
          ariaLabelBase={`${routeLabel} bioavailability`}
          label="Bioavailability"
          panelId={`dosage-${routeId}-bioavailability-notes`}
          value={route.bioavailability}
          notes={route.bioavailability_notes}
        />
      ) : null}
      {hasNotes && (
        <div className="mt-3 pt-3">
          <div className="theme-horizontal-divider mb-3" />
          <p className="theme-text-muted whitespace-pre-line text-xs">
            <CitedText text={route.notes} article={article} />
          </p>
        </div>
      )}
    </>
  );
}

export function DurationPanel({
  route,
  article,
}: {
  route: DurationRoute;
  article: SubstanceArticle;
}) {
  const routeId = route.route.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const routeLabel = formatRouteLabel(route.route);

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
          if (value === "N/A") return null;
          return (
            <div
              key={key}
              className="theme-duration-stage-row flex items-center justify-between rounded-lg px-3 py-1.5 text-sm"
            >
              <span className="theme-text-secondary font-medium">{label}</span>
              <span className="theme-text-muted font-mono text-xs">{value}</span>
            </div>
          );
        })}
      </div>
      {route.half_life?.trim() ? (
        <ExpandableNoteRow
          article={article}
          ariaLabelBase={`${routeLabel} half-life`}
          label="Half-life"
          panelId={`duration-${routeId}-half-life-notes`}
          value={route.half_life}
          notes={route.half_life_notes}
        />
      ) : null}
    </div>
  );
}
