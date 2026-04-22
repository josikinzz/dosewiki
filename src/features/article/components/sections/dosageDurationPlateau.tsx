import { useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { DosageRoute, SubstanceArticle } from "@/schema";
import { DoseTiersTable } from "./dosageDurationShared";

const PLATEAU_TIERS: Array<{
  key: string;
  label: string;
  gradientFrom: string;
  isSigma?: boolean;
}> = [
  { key: "first_plateau", label: "Plateau 1", gradientFrom: "from-emerald-400/50" },
  { key: "second_plateau", label: "Plateau 2", gradientFrom: "from-sky-400/50" },
  { key: "third_plateau", label: "Plateau 3", gradientFrom: "from-amber-400/50" },
  { key: "fourth_plateau", label: "Plateau 4", gradientFrom: "from-orange-400/50" },
  { key: "fifth_plateau", label: "Plateau Sigma", gradientFrom: "from-rose-500/60", isSigma: true },
];

function PlateauTiersTable({
  plateauDosing,
}: {
  plateauDosing: NonNullable<SubstanceArticle["dosage"]["plateau_dosing"]>;
}) {
  const [expandedPlateau, setExpandedPlateau] = useState<string | null>(null);

  const togglePlateau = (key: string) => {
    setExpandedPlateau((previous) => (previous === key ? null : key));
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
                "overflow-hidden rounded-lg",
                isExpanded && (isSigma ? "ring-1 ring-rose-500/30" : "ring-1 ring-white/10"),
              )}
            >
              <div
                className={cn(
                  "relative flex items-center justify-between overflow-hidden px-3 py-1.5 text-sm",
                  isSigma ? "bg-rose-500/10" : "bg-white/5",
                  !isExpanded && "rounded-lg",
                  !isExpanded && isSigma && "ring-1 ring-rose-500/30",
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute bottom-0 left-0 top-0 w-3/4 bg-gradient-to-r to-transparent",
                    !isExpanded && "rounded-l-lg",
                    gradientFrom,
                  )}
                />
                <span className={cn("relative font-medium", isSigma ? "text-rose-200" : "text-white/80")}>
                  {label}
                </span>
                <div className="relative flex items-center gap-2">
                  <span className={cn("font-mono text-xs", isSigma ? "text-rose-200/80" : "text-white/70")}>
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
                <div className={cn("px-3 py-2", isSigma ? "bg-rose-500/5" : "bg-white/[0.02]")}>
                  <div
                    className={cn(
                      "-mx-3 -mt-2 mb-2 h-px bg-gradient-to-r from-transparent to-transparent",
                      isSigma ? "via-rose-500/20" : "via-white/5",
                    )}
                  />
                  <p className={cn("text-xs leading-relaxed", isSigma ? "text-rose-200/70" : "text-white/50")}>
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
          <p className="whitespace-pre-line text-xs text-white/60">{plateauDosing.notes}</p>
        </div>
      )}
    </>
  );
}

export function DosagePanel({
  route,
  plateauDosing,
}: {
  route: DosageRoute;
  plateauDosing?: SubstanceArticle["dosage"]["plateau_dosing"];
}) {
  return (
    <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="text-fuchsia-200">◌</span>
          Dosage
        </h4>
      </div>

      {plateauDosing ? (
        <Tabs defaultValue="traditional" className="w-full">
          <TabsList className="mb-3 h-auto p-1">
            <TabsTrigger value="traditional" className="px-3 py-1 text-xs">
              Traditional
            </TabsTrigger>
            <TabsTrigger value="plateau" className="px-3 py-1 text-xs">
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
