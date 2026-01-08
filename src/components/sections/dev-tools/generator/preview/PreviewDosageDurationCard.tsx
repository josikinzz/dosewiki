import { memo } from "react";
import { Clock, Pill } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { GeneratedArticle, DosageRoute, DurationRoute, DoseRange, DurationStage } from "../../../../../types/generatorSchema";

interface PreviewDosageDurationCardProps {
  article: GeneratedArticle;
}

function formatDose(range: DoseRange): string {
  if (range.min === null && range.max === null) return "N/A";
  if (range.min !== null && range.max !== null) {
    return `${range.min}-${range.max} ${range.unit}`;
  }
  if (range.min !== null) {
    return `${range.min}+ ${range.unit}`;
  }
  return `${range.max} ${range.unit}`;
}

function formatDuration(stage: DurationStage): string {
  if (stage.min === null && stage.max === null) return "N/A";
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

const DOSE_TIERS = [
  { key: "threshold", label: "Threshold", color: "bg-emerald-500/20 text-emerald-300" },
  { key: "light", label: "Light", color: "bg-sky-500/20 text-sky-300" },
  { key: "moderate", label: "Moderate", color: "bg-amber-500/20 text-amber-300" },
  { key: "strong", label: "Strong", color: "bg-orange-500/20 text-orange-300" },
  { key: "heavy", label: "Heavy", color: "bg-rose-500/20 text-rose-300" },
] as const;

const DURATION_STAGES = [
  { key: "onset", label: "Onset" },
  { key: "come_up", label: "Come Up" },
  { key: "peak", label: "Peak" },
  { key: "offset", label: "Offset" },
  { key: "after_effects", label: "After Effects" },
  { key: "total_duration", label: "Total" },
] as const;

function DosageRouteCard({ route }: { route: DosageRoute }) {
  const hasNotes = route.notes.trim().length > 0;
  const hasBioavailability = route.bioavailability.trim().length > 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold text-white">{capitalizeRoute(route.route)}</h4>
        {hasBioavailability && (
          <span className="text-xs text-white/50">
            Bioavailability: {route.bioavailability}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {DOSE_TIERS.map(({ key, label, color }) => {
          const range = route.dose_ranges[key as keyof typeof route.dose_ranges];
          const value = formatDose(range);
          if (value === "N/A") return null;
          return (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className={`rounded px-2 py-0.5 ${color}`}>{label}</span>
              <span className="font-mono text-white/80">{value}</span>
            </div>
          );
        })}
      </div>
      {hasNotes && (
        <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/60">
          {route.notes}
        </p>
      )}
    </div>
  );
}

function DurationRouteCard({ route }: { route: DurationRoute }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h4 className="mb-3 font-semibold text-white">{capitalizeRoute(route.route)}</h4>
      <div className="space-y-2">
        {DURATION_STAGES.map(({ key, label }) => {
          const stage = route.stages[key as keyof typeof route.stages];
          const value = formatDuration(stage);
          if (value === "N/A") return null;
          return (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-white/60">{label}</span>
              <span className="font-mono text-white/80">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const PreviewDosageDurationCard = memo(function PreviewDosageDurationCard({
  article,
}: PreviewDosageDurationCardProps) {
  const { dosage, duration } = article;
  const hasDosage = dosage.routes.length > 0;
  const hasDuration = duration.routes.length > 0;

  if (!hasDosage && !hasDuration) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Dosage Column */}
        {hasDosage && (
          <div>
            <h3 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
              <IconBadge icon={Pill} label="Dosage" />
              Dosage
            </h3>
            <div className="space-y-4">
              {dosage.routes.map((route, idx) => (
                <DosageRouteCard key={`${route.route}-${idx}`} route={route} />
              ))}
            </div>
          </div>
        )}

        {/* Duration Column */}
        {hasDuration && (
          <div>
            <h3 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
              <IconBadge icon={Clock} label="Duration" />
              Duration
            </h3>
            <div className="space-y-4">
              {duration.routes.map((route, idx) => (
                <DurationRouteCard key={`${route.route}-${idx}`} route={route} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Plateau Dosing (DXM-specific) */}
      {dosage.plateau_dosing && (
        <div className="mt-6 border-t border-white/10 pt-6">
          <h4 className="mb-3 font-semibold text-white">DXM Plateau Dosing</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["first_plateau", "second_plateau", "third_plateau", "fourth_plateau"] as const).map((key, idx) => {
              const plateau = dosage.plateau_dosing![key];
              if (!plateau || (plateau.min === null && plateau.max === null)) return null;
              const doseText = plateau.max !== null
                ? `${plateau.min}-${plateau.max} ${plateau.unit}`
                : `${plateau.min}+ ${plateau.unit}`;
              return (
                <div key={key} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-xs font-medium text-white/60">Plateau {idx + 1}</div>
                  <div className="mt-1 font-mono text-sm text-white">{doseText}</div>
                  {plateau.effects && (
                    <p className="mt-2 text-xs text-white/50">{plateau.effects}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
});
