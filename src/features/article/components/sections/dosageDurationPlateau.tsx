import { useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { DosageRoute, SubstanceArticle } from "@/schema";
import { CitationMarker, CitedText } from "../CitedText";
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
  article,
  plateauDosing,
}: {
  article: SubstanceArticle;
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
                "theme-plateau-tier-shell overflow-hidden rounded-lg",
                isExpanded && "ring-1 ring-[var(--theme-frosted-control-on-panel-hover-border)]",
              )}
            >
              <div
                className={cn(
                  "theme-plateau-tier-row relative flex items-center justify-between overflow-hidden px-3 py-1.5 text-sm",
                  !isExpanded && "rounded-lg",
                  !isExpanded && isSigma && "ring-1 ring-[var(--theme-semantic-danger-badge-border)]",
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute bottom-0 left-0 top-0 w-3/4 bg-gradient-to-r to-transparent",
                    !isExpanded && "rounded-l-lg",
                    gradientFrom,
                  )}
                />
                <span className={cn("relative font-medium", isSigma ? "text-[var(--theme-semantic-danger-badge-text)]" : "theme-text-secondary")}>
                  {label}
                </span>
                <div className="relative flex items-center gap-2">
                  <span className={cn("font-mono text-xs", isSigma ? "text-[var(--theme-semantic-danger-badge-text)]" : "theme-text-muted")}>
                    {doseText}
                  </span>
                  {hasEffects && (
                    <ExpandButton
                      isExpanded={isExpanded}
                      onToggle={() => togglePlateau(key)}
                      variant="inline"
                      className={isSigma ? "text-[var(--theme-semantic-danger-badge-text)]" : "theme-text-muted"}
                      ariaLabel={isExpanded ? "Collapse effects" : "Expand effects"}
                    />
                  )}
                </div>
              </div>
              {isExpanded && hasEffects && (
                <div className="theme-plateau-tier-expanded px-3 py-2">
                  <div className="theme-horizontal-divider -mx-3 -mt-2 mb-2 w-auto" />
                  <p className={cn("text-xs leading-relaxed", isSigma ? "text-[var(--theme-semantic-danger-badge-text)]" : "theme-text-muted")}>
                    <CitedText text={plateau.effects} article={article} />
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hasNotes && (
        <div className="mt-3 pt-3">
          <div className="theme-horizontal-divider mb-3" />
          <p className="theme-text-muted whitespace-pre-line text-xs">
            <CitedText text={plateauDosing.notes} article={article} />
          </p>
        </div>
      )}
    </>
  );
}

export function DosagePanel({
  article,
  route,
  plateauDosing,
}: {
  article: SubstanceArticle;
  route: DosageRoute;
  plateauDosing?: SubstanceArticle["dosage"]["plateau_dosing"];
}) {
  return (
    <div className="theme-dose-duration-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="theme-text-primary flex items-center gap-2 text-sm font-semibold">
          <Icon icon="charm:chart-bar" size={20} className="theme-accent-emphasis" />
          Dosage
          <CitationMarker article={article} referenceIds={route.reference_ids} />
        </h3>
      </div>

      {plateauDosing ? (
        <Tabs defaultValue="traditional" className="w-full">
          <TabsList className="theme-dosage-mode-tabs mb-3 h-auto p-1">
            <TabsTrigger value="traditional" className="theme-dosage-mode-tab px-3 py-1 text-xs">
              Traditional
            </TabsTrigger>
            <TabsTrigger value="plateau" className="theme-dosage-mode-tab px-3 py-1 text-xs">
              Plateau
            </TabsTrigger>
          </TabsList>
          <TabsContent value="traditional">
            <DoseTiersTable route={route} article={article} />
          </TabsContent>
          <TabsContent value="plateau">
            <PlateauTiersTable article={article} plateauDosing={plateauDosing} />
          </TabsContent>
        </Tabs>
      ) : (
        <DoseTiersTable route={route} article={article} />
      )}
    </div>
  );
}
