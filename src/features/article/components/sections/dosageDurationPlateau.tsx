import { useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { DosageRoute, SubstanceArticle } from "@/schema";
import { CitationMarker, CitedText } from "../CitedText";
import { DoseTiersTable } from "./dosageDurationShared";
import { DOSAGE_PANEL_DISCLAIMER_FALLBACK } from "./dosageDisclaimerCopy";

const PLATEAU_TIERS: Array<{
  key: string;
  label: string;
  isSigma?: boolean;
}> = [
  { key: "first_plateau", label: "Plateau 1" },
  { key: "second_plateau", label: "Plateau 2" },
  { key: "third_plateau", label: "Plateau 3" },
  { key: "fourth_plateau", label: "Plateau 4" },
  { key: "fifth_plateau", label: "Plateau Sigma", isSigma: true },
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
        {PLATEAU_TIERS.map(({ key, label, isSigma }) => {
          const plateau = plateauDosing[key as keyof typeof plateauDosing];
          if (!plateau || typeof plateau === "string") return null;

          const hasDoseRange = plateau.min !== null || plateau.max !== null;
          if (!isSigma && !hasDoseRange) return null;

          const doseText = hasDoseRange
            ? plateau.max !== null
              ? plateau.min === plateau.max
                ? `${plateau.min} ${plateau.unit}`
                : `${plateau.min}-${plateau.max} ${plateau.unit}`
              : `${plateau.min}+ ${plateau.unit}`
            : "via redosing";

          const hasEffects = !!plateau.effects?.trim();
          const isExpanded = expandedPlateau === key;
          const effectsPanelId = `plateau-${key.replace(/_/g, "-")}-effects`;

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
                  data-plateau-tier={key}
                  className={cn(
                    "pointer-events-none absolute bottom-0 left-0 top-0",
                    !isExpanded && "rounded-l-lg",
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
                      ariaLabel={isExpanded ? `Collapse ${label} effects` : `Expand ${label} effects`}
                      ariaControls={effectsPanelId}
                    />
                  )}
                </div>
              </div>
              {isExpanded && hasEffects && (
                <div id={effectsPanelId} className="theme-plateau-tier-expanded px-3 py-2">
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
        <div className="mt-3">
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
  routeIndex,
  plateauDosing,
  disclaimer = DOSAGE_PANEL_DISCLAIMER_FALLBACK,
}: {
  article: SubstanceArticle;
  route: DosageRoute;
  /**
   * Index of `route` in `article.dosage.routes`. Optional so the public render
   * path is unchanged; supplied only where inline editing is available.
   */
  routeIndex?: number;
  plateauDosing?: SubstanceArticle["dosage"]["plateau_dosing"];
  /**
   * The `dosage-panel-disclaimer` copy block, resolved by the route loader.
   * Hosts that mount the article without one — the review workbench, the
   * Generator preview — get the checked-in default rather than a bare table,
   * and an editor who blanks the block silently drops the line.
   */
  disclaimer?: string;
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

      {disclaimer.trim() ? (
        <p className="theme-text-muted mb-3 flex items-start gap-2 text-xs leading-relaxed">
          <Icon icon="cuida:warning-outline" size={14} className="mt-0.5 shrink-0" />
          <span>{disclaimer}</span>
        </p>
      ) : null}

      {plateauDosing ? (
        <Tabs defaultValue="traditional" className="w-full">
          <TabsList className="theme-dosage-mode-tabs mb-3 h-auto p-1">
            <TabsTrigger value="traditional" className="theme-dosage-mode-tab min-h-8 px-3 py-1 text-xs [@media(pointer:coarse)]:min-h-11">
              Traditional
            </TabsTrigger>
            <TabsTrigger value="plateau" className="theme-dosage-mode-tab min-h-8 px-3 py-1 text-xs [@media(pointer:coarse)]:min-h-11">
              Plateau
            </TabsTrigger>
          </TabsList>
          <TabsContent value="traditional">
            <DoseTiersTable route={route} routeIndex={routeIndex} article={article} />
          </TabsContent>
          <TabsContent value="plateau">
            <PlateauTiersTable article={article} plateauDosing={plateauDosing} />
          </TabsContent>
        </Tabs>
      ) : (
        <DoseTiersTable route={route} routeIndex={routeIndex} article={article} />
      )}
    </div>
  );
}
