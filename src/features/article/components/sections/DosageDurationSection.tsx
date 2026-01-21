import { memo, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { IconBadge } from "@/components/common/IconBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { SubstanceArticle, DosageRoute, DurationRoute, DoseRange, DurationStage } from "@/schema";

interface DosageDurationSectionProps {
  article: SubstanceArticle;
}

function formatDose(range: DoseRange | null, isThreshold = false): string {
  if (!range || (range.min === null && range.max === null)) return "N/A";
  if (range.min !== null && range.max !== null) {
    return `${range.min}-${range.max} ${range.unit}`;
  }
  if (range.min !== null) {
    // Threshold uses "~X" prefix, others use "X+" suffix
    return isThreshold ? `~${range.min} ${range.unit}` : `${range.min}+ ${range.unit}`;
  }
  return `${range.max} ${range.unit}`;
}

function formatDuration(stage: DurationStage | null): string {
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

/** Icons for route of administration tabs */
const ROUTE_ICONS: Record<string, IconName> = {
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

/** Standard dose tiers table */
function DoseTiersTable({ route }: { route: DosageRoute }) {
  const hasNotes = !!route.notes?.trim();

  return (
    <>
      <div className="space-y-1.5">
        {DOSE_TIERS.map(({ key, label, gradientFrom }) => {
          const range = route.dose_ranges[key as keyof typeof route.dose_ranges];
          const value = formatDose(range, key === "threshold");
          if (value === "N/A") return null;
          return (
            <div key={key} className="relative flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm odd:bg-white/10 overflow-hidden">
              <div className={`absolute left-0 top-0 bottom-0 w-3/4 bg-gradient-to-r ${gradientFrom} to-transparent rounded-l-lg pointer-events-none`} />
              <span className="relative font-medium text-white/80">{label}</span>
              <span className="relative font-mono text-xs text-white/70">{value}</span>
            </div>
          );
        })}
      </div>
      {hasNotes && (
        <div className="mt-3 pt-3">
          <div className="mb-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <p className="text-xs text-white/60 whitespace-pre-line">
            {route.notes}
          </p>
        </div>
      )}
    </>
  );
}

const PLATEAU_TIERS = [
  { key: "first_plateau", label: "Plateau 1", gradientFrom: "from-emerald-400/50" },
  { key: "second_plateau", label: "Plateau 2", gradientFrom: "from-sky-400/50" },
  { key: "third_plateau", label: "Plateau 3", gradientFrom: "from-amber-400/50" },
  { key: "fourth_plateau", label: "Plateau 4", gradientFrom: "from-orange-400/50" },
  { key: "fifth_plateau", label: "Plateau Sigma", gradientFrom: "from-rose-500/60", isSigma: true },
] as const;

/** Plateau dosing table (DXM-specific) */
function PlateauTiersTable({ plateauDosing }: { plateauDosing: NonNullable<SubstanceArticle["dosage"]["plateau_dosing"]> }) {
  const [expandedPlateau, setExpandedPlateau] = useState<string | null>(null);

  const togglePlateau = (key: string) => {
    setExpandedPlateau((prev) => (prev === key ? null : key));
  };

  const hasNotes = !!plateauDosing.notes?.trim();

  return (
    <>
      <div className="space-y-1.5">
        {PLATEAU_TIERS.map(({ key, label, gradientFrom, isSigma }) => {
          const plateau = plateauDosing[key as keyof typeof plateauDosing];
          if (!plateau || typeof plateau === "string") return null;
          
          const hasDoseRange = plateau.min !== null || plateau.max !== null;
          if (!isSigma && !hasDoseRange) return null;
          
          const doseText = hasDoseRange
            ? plateau.max !== null
              ? `${plateau.min}-${plateau.max} ${plateau.unit}`
              : `${plateau.min}+ ${plateau.unit}`
            : "via redosing";
          
          const hasEffects = !!plateau.effects?.trim();
          const isExpanded = expandedPlateau === key;
          
          return (
            <div
              key={key}
              className={cn(
                "rounded-lg overflow-hidden",
                isExpanded && (isSigma ? "ring-1 ring-rose-500/30" : "ring-1 ring-white/10")
              )}
            >
              <div
                className={cn(
                  "relative flex items-center justify-between px-3 py-1.5 text-sm overflow-hidden",
                  isSigma
                    ? "bg-rose-500/10"
                    : "bg-white/5",
                  !isExpanded && "rounded-lg",
                  !isExpanded && isSigma && "ring-1 ring-rose-500/30"
                )}
              >
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-3/4 bg-gradient-to-r to-transparent pointer-events-none",
                  !isExpanded && "rounded-l-lg",
                  gradientFrom
                )} />
                <span className={cn(
                  "relative font-medium",
                  isSigma ? "text-rose-200" : "text-white/80"
                )}>
                  {label}
                </span>
                <div className="relative flex items-center gap-2">
                  <span className={cn(
                    "font-mono text-xs",
                    isSigma ? "text-rose-200/80" : "text-white/70"
                  )}>
                    {doseText}
                  </span>
                  {hasEffects && (
                    <button
                      type="button"
                      onClick={() => togglePlateau(key)}
                      className={cn(
                        "flex items-center gap-0.5 rounded px-1.5 py-0.5 transition",
                        "hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400",
                        isSigma ? "text-rose-200/70" : "text-white/50"
                      )}
                      aria-label={isExpanded ? "Collapse effects" : "Expand effects"}
                      aria-expanded={isExpanded}
                    >
                      <Icon icon="lucide:ellipsis" size={12} />
                      <Icon icon="lucide:chevron-down" size={12} className={cn(
                        "transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && hasEffects && (
                <div className={cn(
                  "px-3 py-2",
                  isSigma ? "bg-rose-500/5" : "bg-white/[0.02]"
                )}>
                  <div className={cn(
                    "mb-2 -mt-2 -mx-3 h-px bg-gradient-to-r from-transparent to-transparent",
                    isSigma ? "via-rose-500/20" : "via-white/5"
                  )} />
                  <p className={cn(
                    "text-xs leading-relaxed",
                    isSigma ? "text-rose-200/70" : "text-white/50"
                  )}>
                    {plateau.effects}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hasNotes && (
        <div className="mt-3 pt-3">
          <div className="mb-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <p className="text-xs text-white/60 whitespace-pre-line">
            {plateauDosing.notes}
          </p>
        </div>
      )}
    </>
  );
}

function DosagePanel({ route, plateauDosing }: { route: DosageRoute; plateauDosing?: SubstanceArticle["dosage"]["plateau_dosing"] }) {
  const hasBioavailability = !!route.bioavailability?.trim();
  const hasBioavailabilityNotes = !!route.bioavailability_notes?.trim();
  const hasPlateauDosing = !!plateauDosing;

  return (
    <div className="rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon icon="lucide:chart-column-increasing" size={16} className="text-fuchsia-200" />
          Dosage
        </h4>
        {hasBioavailability && (
          <span className="text-xs text-white/50">
            Bio: {route.bioavailability}
          </span>
        )}
      </div>
      
      {hasPlateauDosing ? (
        <Tabs defaultValue="traditional" className="w-full">
          <TabsList className="mb-3 h-auto p-1">
            <TabsTrigger value="traditional" className="text-xs px-3 py-1">
              Traditional
            </TabsTrigger>
            <TabsTrigger value="plateau" className="text-xs px-3 py-1">
              Plateau
            </TabsTrigger>
          </TabsList>
          <TabsContent value="traditional">
            <DoseTiersTable route={route} />
          </TabsContent>
          <TabsContent value="plateau">
            <PlateauTiersTable plateauDosing={plateauDosing} />
          </TabsContent>
        </Tabs>
      ) : (
        <DoseTiersTable route={route} />
      )}
      
      {hasBioavailabilityNotes && (
        <p className="mt-3 text-xs text-white/50 italic">
          {route.bioavailability_notes}
        </p>
      )}
    </div>
  );
}

function DurationPanel({ route }: { route: DurationRoute }) {
  const hasHalfLife = !!route.half_life?.trim();
  const hasHalfLifeNotes = !!route.half_life_notes?.trim();
  
  return (
    <div className="rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon icon="lucide:chart-line" size={20} className="text-fuchsia-200" />
          Duration
        </h4>
        {hasHalfLife && (
          <span className="text-xs text-white/50">
            t½: {route.half_life}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {DURATION_STAGES.map(({ key, label }) => {
          const stage = route.stages[key as keyof typeof route.stages];
          const value = formatDuration(stage);
          if (value === "N/A") return null;
          return (
            <div key={key} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm odd:bg-white/10">
              <span className="text-white/70 font-medium">{label}</span>
              <span className="font-mono text-xs text-white/70">{value}</span>
            </div>
          );
        })}
      </div>
      {hasHalfLifeNotes && (
        <p className="mt-3 text-xs text-white/50 italic">
          {route.half_life_notes}
        </p>
      )}
    </div>
  );
}

export const DosageDurationSection = memo(function DosageDurationSection({
  article,
}: DosageDurationSectionProps) {
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
        <IconBadge icon="lucide:chart-no-axes-combined" label="Dosage & Duration" />
        Dosage & Duration
      </h2>

      <Tabs defaultValue={defaultRoute} className="w-full">
        <TabsList className="mb-4 flex-wrap">
          {allRoutes.map(route => {
            const routeIcon = ROUTE_ICONS[route.toLowerCase()];
            return (
              <TabsTrigger key={route} value={route} className="gap-1.5">
                {routeIcon && <Icon icon={routeIcon} size={16} />}
                {capitalizeRoute(route)}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {allRoutes.map(route => {
          const dosageForRoute = dosage.routes.find(r => r.route === route);
          const durationForRoute = duration.routes.find(r => r.route === route);

          return (
            <TabsContent key={route} value={route}>
              <div className="grid gap-4 md:grid-cols-2 items-start">
                {dosageForRoute && <DosagePanel route={dosageForRoute} plateauDosing={dosage.plateau_dosing} />}
                {durationForRoute && <DurationPanel route={durationForRoute} />}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </SectionCard>
  );
});
