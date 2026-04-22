import { useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import type { DosageRoute, DurationRoute, DoseRange, DurationStage } from "@/schema";

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
  { key: "threshold", label: "Threshold", gradientFrom: "from-emerald-400/50" },
  { key: "light", label: "Light", gradientFrom: "from-sky-400/50" },
  { key: "moderate", label: "Moderate", gradientFrom: "from-amber-400/50" },
  { key: "strong", label: "Strong", gradientFrom: "from-orange-400/50" },
  { key: "heavy", label: "Heavy", gradientFrom: "from-rose-400/50" },
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
  label,
  value,
  notes,
}: {
  label: string;
  value: string;
  notes?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasNotes = !!notes?.trim();

  return (
    <div className="mt-3">
      <div className={cn("overflow-hidden rounded-lg", expanded && "ring-1 ring-fuchsia-500/20")}>
        <div
          className={cn(
            "relative flex items-center justify-between rounded-lg bg-fuchsia-500/10 px-3 py-1.5 text-sm",
            expanded && "rounded-b-none",
          )}
        >
          <span className="font-medium text-fuchsia-200">{label}</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-fuchsia-200/80">{value}</span>
            {hasNotes && (
              <ExpandButton
                isExpanded={expanded}
                onToggle={() => setExpanded(!expanded)}
                variant="compact"
                className="text-fuchsia-200/70"
                ariaLabel={expanded ? "Collapse notes" : "Expand notes"}
              />
            )}
          </div>
        </div>
        {expanded && hasNotes && (
          <div className="bg-fuchsia-500/5 px-3 py-2">
            <div className="-mx-3 -mt-2 mb-2 h-px bg-gradient-to-r from-transparent via-fuchsia-500/20 to-transparent" />
            <ul className="space-y-1">
              {notes!
                .split("\n")
                .filter((line) => line.trim())
                .map((line, index) => (
                  <li key={index} className="flex gap-2 text-xs leading-relaxed text-fuchsia-200/70">
                    <span className="select-none text-fuchsia-400/60">•</span>
                    <span>{line.replace(/^[•\-*]\s*/, "").trim()}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function DoseTiersTable({ route }: { route: DosageRoute }) {
  const hasNotes = !!route.notes?.trim();

  return (
    <>
      <div className="space-y-1.5">
        {DOSE_TIERS.map(({ key, label, gradientFrom }) => {
          const range = route.dose_ranges[key as keyof typeof route.dose_ranges];
          const value = formatDose(range, key === "threshold");
          if (value === "N/A") return null;
          return (
            <div
              key={key}
              className="relative overflow-hidden rounded-lg bg-white/5 px-3 py-1.5 text-sm odd:bg-white/10"
            >
              <div
                className={`pointer-events-none absolute bottom-0 left-0 top-0 w-3/4 rounded-l-lg bg-gradient-to-r ${gradientFrom} to-transparent`}
              />
              <div className="relative flex items-center justify-between">
                <span className="font-medium text-white/80">{label}</span>
                <span className="font-mono text-xs text-white/70">{value}</span>
              </div>
            </div>
          );
        })}
      </div>
      {route.bioavailability?.trim() ? (
        <ExpandableNoteRow
          label="Bioavailability"
          value={route.bioavailability}
          notes={route.bioavailability_notes}
        />
      ) : null}
      {hasNotes && (
        <div className="mt-3 pt-3">
          <div className="mb-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <p className="whitespace-pre-line text-xs text-white/60">{route.notes}</p>
        </div>
      )}
    </>
  );
}

export function DurationPanel({ route }: { route: DurationRoute }) {
  return (
    <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon icon="lucide:chart-line" size={20} className="text-fuchsia-200" />
          Duration
        </h4>
      </div>
      <div className="space-y-1.5">
        {DURATION_STAGES.map(({ key, label }) => {
          const stage = route.stages[key as keyof typeof route.stages];
          const value = formatDuration(stage);
          if (value === "N/A") return null;
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm odd:bg-white/10"
            >
              <span className="font-medium text-white/70">{label}</span>
              <span className="font-mono text-xs text-white/70">{value}</span>
            </div>
          );
        })}
      </div>
      {route.half_life?.trim() ? (
        <ExpandableNoteRow label="Half-life" value={route.half_life} notes={route.half_life_notes} />
      ) : null}
    </div>
  );
}
