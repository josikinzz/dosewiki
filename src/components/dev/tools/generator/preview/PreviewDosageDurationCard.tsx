import { memo, useMemo } from "react";
import { ChartNoAxesCombined, ChartColumnIncreasing, ChartLine } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { SubstanceArticle, DosageRoute, DurationRoute, DoseRange, DurationStage } from "../../../../../schema";

interface PreviewDosageDurationCardProps {
  article: SubstanceArticle;
}

function formatDose(range: DoseRange, isThreshold = false): string {
  if (range.min === null && range.max === null) return "N/A";
  if (range.min !== null && range.max !== null) {
    return `${range.min}-${range.max} ${range.unit}`;
  }
  if (range.min !== null) {
    // Threshold uses "~X" prefix, others use "X+" suffix
    return isThreshold ? `~${range.min} ${range.unit}` : `${range.min}+ ${range.unit}`;
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
  { key: "threshold", label: "Threshold", borderColor: "border-emerald-400/50" },
  { key: "light", label: "Light", borderColor: "border-sky-400/50" },
  { key: "moderate", label: "Moderate", borderColor: "border-amber-400/50" },
  { key: "strong", label: "Strong", borderColor: "border-orange-400/50" },
  { key: "heavy", label: "Heavy", borderColor: "border-rose-400/50" },
] as const;

const DURATION_STAGES = [
  { key: "onset", label: "Onset", borderColor: "border-emerald-400/50" },
  { key: "come_up", label: "Come Up", borderColor: "border-orange-400/50" },
  { key: "peak", label: "Peak", borderColor: "border-rose-400/50" },
  { key: "offset", label: "Offset", borderColor: "border-orange-400/50" },
  { key: "after_effects", label: "After Effects", borderColor: "border-sky-400/50" },
  { key: "total_duration", label: "Total", borderColor: "border-fuchsia-400/50" },
] as const;

function DosagePanel({ route }: { route: DosageRoute }) {
  const hasNotes = route.notes?.trim().length > 0;
  const hasBioavailability = route.bioavailability?.trim().length > 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-semibold text-white">
          <ChartColumnIncreasing className="h-4 w-4 text-fuchsia-200" />
          Dosage
        </h4>
        {hasBioavailability && (
          <span className="text-xs text-white/50">
            Bio: {route.bioavailability}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {DOSE_TIERS.map(({ key, label, borderColor }) => {
          const range = route.dose_ranges[key as keyof typeof route.dose_ranges];
          const value = formatDose(range, key === "threshold");
          if (value === "N/A") return null;
          return (
            <div key={key} className={`flex items-center justify-between rounded-lg border-l-2 ${borderColor} bg-white/[0.03] px-3 py-1.5 text-sm odd:bg-white/[0.07]`}>
              <span className="font-medium text-white/80">{label}</span>
              <span className="font-mono text-xs text-white/70">{value}</span>
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

function DurationPanel({ route }: { route: DurationRoute }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h4 className="mb-3 flex items-center gap-2 font-semibold text-white">
        <ChartLine className="h-4 w-4 text-fuchsia-200" />
        Duration
      </h4>
      <div className="space-y-1.5">
        {DURATION_STAGES.map(({ key, label, borderColor }) => {
          const stage = route.stages[key as keyof typeof route.stages];
          const value = formatDuration(stage);
          if (value === "N/A") return null;
          return (
            <div key={key} className={`flex items-center justify-between rounded-lg border-l-2 ${borderColor} bg-white/[0.03] px-3 py-1.5 text-sm odd:bg-white/[0.07]`}>
              <span className="text-white/70 font-medium">{label}</span>
              <span className="font-mono text-xs text-white/70">{value}</span>
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

  // Collect unique routes from both dosage and duration
  const allRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    dosage.routes.forEach(r => routeSet.add(r.route));
    duration.routes.forEach(r => routeSet.add(r.route));
    return Array.from(routeSet);
  }, [dosage, duration]);

  const hasDosage = dosage.routes.length > 0;
  const hasDuration = duration.routes.length > 0;

  if (!hasDosage && !hasDuration) {
    return null;
  }

  const defaultRoute = allRoutes[0] || "oral";

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={ChartNoAxesCombined} label="Dosage & Duration" />
        Dosage & Duration
      </h2>

      <Tabs defaultValue={defaultRoute} className="w-full">
        <TabsList className="mb-4 flex-wrap">
          {allRoutes.map(route => (
            <TabsTrigger key={route} value={route}>
              {capitalizeRoute(route)}
            </TabsTrigger>
          ))}
        </TabsList>

        {allRoutes.map(route => {
          const dosageForRoute = dosage.routes.find(r => r.route === route);
          const durationForRoute = duration.routes.find(r => r.route === route);

          return (
            <TabsContent key={route} value={route}>
              <div className="grid gap-4 md:grid-cols-2 items-start">
                {dosageForRoute && <DosagePanel route={dosageForRoute} />}
                {durationForRoute && <DurationPanel route={durationForRoute} />}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Plateau Dosing (DXM-specific) */}
      {dosage.plateau_dosing && (
        <div className="mt-6 border-t border-white/10 pt-6">
          <h4 className="mb-3 font-semibold text-white">DXM Plateau Dosing</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-start">
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
