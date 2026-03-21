import { memo, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
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

const ROUTE_LABELS: Record<string, string> = {
  iv: "IV",
  intravenous: "Intravenous",
  im: "IM",
  intramuscular: "Intramuscular",
  "i.m.": "IM",
  "iv/im": "IV/IM",
};

function formatRouteLabel(route: string): string {
  return ROUTE_LABELS[route.toLowerCase()] ?? capitalizeRoute(route);
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
      <BioavailabilityRow route={route} />
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

const PLATEAU_TIERS: Array<{ key: string; label: string; gradientFrom: string; isSigma?: boolean }> = [
  { key: "first_plateau", label: "Plateau 1", gradientFrom: "from-emerald-400/50" },
  { key: "second_plateau", label: "Plateau 2", gradientFrom: "from-sky-400/50" },
  { key: "third_plateau", label: "Plateau 3", gradientFrom: "from-amber-400/50" },
  { key: "fourth_plateau", label: "Plateau 4", gradientFrom: "from-orange-400/50" },
  { key: "fifth_plateau", label: "Plateau Sigma", gradientFrom: "from-rose-500/60", isSigma: true },
];

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
                    <ExpandButton
                      isExpanded={isExpanded}
                      onToggle={() => togglePlateau(key)}
                      variant="compact"
                      className={isSigma ? "text-rose-200/70" : "text-white/50"}
                      ariaLabel={isExpanded ? "Collapse effects" : "Expand effects"}
                    />
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

function BioavailabilityRow({ route }: { route: DosageRoute }) {
  const [expanded, setExpanded] = useState(false);
  const hasBioavailability = !!route.bioavailability?.trim();
  const hasNotes = !!route.bioavailability_notes?.trim();

  if (!hasBioavailability) return null;

  return (
    <div className="mt-3">
      <div
        className={cn(
          "rounded-lg overflow-hidden",
          expanded && "ring-1 ring-fuchsia-500/20"
        )}
      >
        <div
          className={cn(
            "relative flex items-center justify-between px-3 py-1.5 text-sm bg-fuchsia-500/10",
            !expanded && "rounded-lg"
          )}
        >
          <span className="font-medium text-fuchsia-200">Bioavailability</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-fuchsia-200/80">
              {route.bioavailability}
            </span>
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
          <div className="px-3 py-2 bg-fuchsia-500/5">
            <div className="mb-2 -mt-2 -mx-3 h-px bg-gradient-to-r from-transparent via-fuchsia-500/20 to-transparent" />
            <ul className="space-y-1">
              {route.bioavailability_notes!.split('\n').filter(line => line.trim()).map((line, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-fuchsia-200/70">
                  <span className="text-fuchsia-400/60 select-none">•</span>
                  <span>{line.replace(/^[•\-*]\s*/, '').trim()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function DosagePanel({ route, plateauDosing }: { route: DosageRoute; plateauDosing?: SubstanceArticle["dosage"]["plateau_dosing"] }) {
  const hasPlateauDosing = !!plateauDosing;

  return (
    <div className="rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon icon="lucide:chart-column-increasing" size={16} className="text-fuchsia-200" />
          Dosage
        </h4>
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
    </div>
  );
}

function HalfLifeRow({ route }: { route: DurationRoute }) {
  const [expanded, setExpanded] = useState(false);
  const hasHalfLife = !!route.half_life?.trim();
  const hasNotes = !!route.half_life_notes?.trim();

  if (!hasHalfLife) return null;

  return (
    <div className="mt-3">
      <div
        className={cn(
          "rounded-lg overflow-hidden",
          expanded && "ring-1 ring-fuchsia-500/20"
        )}
      >
        <div
          className={cn(
            "relative flex items-center justify-between px-3 py-1.5 text-sm bg-fuchsia-500/10",
            !expanded && "rounded-lg"
          )}
        >
          <span className="font-medium text-fuchsia-200">Half-life</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-fuchsia-200/80">
              {route.half_life}
            </span>
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
          <div className="px-3 py-2 bg-fuchsia-500/5">
            <div className="mb-2 -mt-2 -mx-3 h-px bg-gradient-to-r from-transparent via-fuchsia-500/20 to-transparent" />
            <ul className="space-y-1">
              {route.half_life_notes!.split('\n').filter(line => line.trim()).map((line, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-fuchsia-200/70">
                  <span className="text-fuchsia-400/60 select-none">•</span>
                  <span>{line.replace(/^[•\-*]\s*/, '').trim()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function DurationPanel({ route }: { route: DurationRoute }) {
  return (
    <div className="rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
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
            <div key={key} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm odd:bg-white/10">
              <span className="text-white/70 font-medium">{label}</span>
              <span className="font-mono text-xs text-white/70">{value}</span>
            </div>
          );
        })}
      </div>
      <HalfLifeRow route={route} />
    </div>
  );
}

export const DosageDurationSection = memo(function DosageDurationSection({
  article,
}: DosageDurationSectionProps) {
  const { dosage, duration } = article;
  const prefersReducedMotion = useReducedMotion();

  // Collect unique routes from both dosage and duration
  const allRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    dosage.routes.forEach(r => routeSet.add(r.route));
    duration.routes.forEach(r => routeSet.add(r.route));
    return Array.from(routeSet);
  }, [dosage, duration]);

  const hasDosage = dosage.routes.length > 0;
  const hasDuration = duration.routes.length > 0;

  const defaultRoute = allRoutes[0] || "oral";
  const [activeRoute, setActiveRoute] = useState(defaultRoute);

  useEffect(() => {
    if (!allRoutes.includes(activeRoute)) {
      setActiveRoute(defaultRoute);
    }
  }, [activeRoute, allRoutes, defaultRoute]);

  const dosageForActiveRoute = dosage.routes.find(r => r.route === activeRoute);
  const durationForActiveRoute = duration.routes.find(r => r.route === activeRoute);
  const hasBothPanels = !!dosageForActiveRoute && !!durationForActiveRoute;

  if (!hasDosage && !hasDuration) {
    return null;
  }

  return (
    <div id="dosage-duration" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:chart-no-axes-combined" title="Dosage & Duration" />

      <Tabs value={activeRoute} onValueChange={setActiveRoute} className="w-full">
        <TabsList className="theme-text-muted mb-3 flex h-auto flex-wrap justify-start gap-1.5 !border-0 !bg-transparent p-0 shadow-none">
          {allRoutes.map(route => {
            const routeIcon = ROUTE_ICONS[route.toLowerCase()];
            const isActive = route === activeRoute;
            return (
              <TabsTrigger
                key={route}
                value={route}
                className={cn(
                  "group relative isolate gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-sm font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-300",
                  "border-white/10 bg-white/[0.04] hover:-translate-y-px hover:border-white/15 hover:bg-white/[0.07] hover:text-white",
                  "active:translate-y-0 active:scale-[0.985]",
                  "data-[state=active]:border-fuchsia-400/20 data-[state=active]:bg-[linear-gradient(135deg,rgba(217,70,239,0.18),rgba(124,58,237,0.12))] data-[state=active]:text-white",
                  "data-[state=active]:shadow-[0_12px_30px_-18px_rgba(217,70,239,0.7),inset_0_0_0_1px_rgba(255,255,255,0.04)]",
                  !prefersReducedMotion && "will-change-transform"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.18),transparent_65%)] opacity-0 transition-opacity duration-300",
                    isActive && "opacity-100"
                  )}
                />
                {routeIcon ? (
                  <span
                    className={cn(
                      "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-300",
                      isActive
                        ? "bg-fuchsia-400/18 text-white ring-fuchsia-300/25 shadow-[0_0_20px_rgba(217,70,239,0.18)]"
                        : "bg-white/[0.05] text-white/85 ring-white/10 group-hover:bg-white/[0.09] group-hover:text-white"
                    )}
                  >
                    <Icon icon={routeIcon} size={16} />
                  </span>
                ) : null}
                <span className="relative">{formatRouteLabel(route)}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={activeRoute} forceMount className="mt-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeRoute}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-24 bg-gradient-to-r from-fuchsia-500/10 via-violet-400/10 to-sky-400/10 blur-3xl"
              />
              <div className={cn("relative grid gap-4 items-start", hasBothPanels ? "md:grid-cols-2" : "md:grid-cols-1")}>
                {dosageForActiveRoute ? (
                  <DosagePanel route={dosageForActiveRoute} plateauDosing={dosage.plateau_dosing} />
                ) : null}
                {durationForActiveRoute ? <DurationPanel route={durationForActiveRoute} /> : null}
              </div>
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </div>
  );
});
