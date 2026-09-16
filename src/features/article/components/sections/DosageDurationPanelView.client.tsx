"use client";

import { useState, type ReactNode } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { DosageRoute, SubstanceArticle } from "@/schema";
import { useT } from "@/i18n/client";
import { msg } from "@/i18n/messages";

import { DoseTiersTable } from "./dosageDurationPanels.client";
import { ArticleDisclaimer } from "./ArticleDisclaimer";
import { DOSAGE_PANEL_DISCLAIMER_FALLBACK } from "./articleDisclaimerCopy";

const PLATEAU_TIERS: Array<{
  key: string;
  label: string;
  isSigma?: boolean;
}> = [
  { key: "first_plateau", label: msg("Plateau 1") },
  { key: "second_plateau", label: msg("Plateau 2") },
  { key: "third_plateau", label: msg("Plateau 3") },
  { key: "fourth_plateau", label: msg("Plateau 4") },
  { key: "fifth_plateau", label: msg("Plateau Sigma"), isSigma: true },
];

function PlateauTiersTable({
  plateauDosing,
  effectsContent,
  notesContent,
}: {
  plateauDosing: NonNullable<SubstanceArticle["dosage"]["plateau_dosing"]>;
  effectsContent: Readonly<Record<string, ReactNode>>;
  notesContent: ReactNode;
}) {
  const t = useT();
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
            : t("via redosing");

          const hasEffects = !!plateau.effects?.trim();
          const isExpanded = expandedPlateau === key;
          const effectsPanelId = `plateau-${key.replace(/_/g, "-")}-effects`;

          return (
            <div
              key={key}
              className={cn(
                "theme-plateau-tier-shell overflow-hidden rounded-lg",
                isExpanded &&
                  "ring-1 ring-[var(--theme-frosted-control-on-panel-hover-border)]",
              )}
            >
              <div
                className={cn(
                  "theme-plateau-tier-row relative flex items-center justify-between overflow-hidden px-3 py-1.5 text-sm",
                  !isExpanded && "rounded-lg",
                  !isExpanded &&
                    isSigma &&
                    "ring-1 ring-[var(--theme-semantic-danger-badge-border)]",
                )}
              >
                <div
                  data-plateau-tier={key}
                  className={cn(
                    "pointer-events-none absolute bottom-0 left-0 top-0",
                    !isExpanded && "rounded-l-lg",
                  )}
                />
                <span
                  className={cn(
                    "relative font-medium",
                    isSigma
                      ? "text-[var(--theme-semantic-danger-badge-text)]"
                      : "theme-text-secondary",
                  )}
                >
                  {t(label)}
                </span>
                <div className="relative flex items-center gap-2">
                  <span
                    className={cn(
                      "font-mono text-xs",
                      isSigma
                        ? "text-[var(--theme-semantic-danger-badge-text)]"
                        : "theme-text-muted",
                    )}
                  >
                    {doseText}
                  </span>
                  {hasEffects && (
                    <ExpandButton
                      isExpanded={isExpanded}
                      onToggle={() => togglePlateau(key)}
                      variant="inline"
                      className={
                        isSigma
                          ? "text-[var(--theme-semantic-danger-badge-text)]"
                          : "theme-text-muted"
                      }
                      ariaLabel={
                        isExpanded
                          ? t("Collapse {{label}} effects", { label: t(label) })
                          : t("Expand {{label}} effects", { label: t(label) })
                      }
                      ariaControls={effectsPanelId}
                    />
                  )}
                </div>
              </div>
              {isExpanded && hasEffects && (
                <div
                  id={effectsPanelId}
                  className="theme-reveal-enter theme-plateau-tier-expanded px-3 py-2"
                >
                  <div className="theme-horizontal-divider -mx-3 -mt-2 mb-2 w-auto" />
                  <p
                    className={cn(
                      "text-xs leading-relaxed",
                      isSigma
                        ? "text-[var(--theme-semantic-danger-badge-text)]"
                        : "theme-text-muted",
                    )}
                  >
                    {effectsContent[key]}
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
            {notesContent}
          </p>
        </div>
      )}
    </>
  );
}

export interface DosagePanelViewProps {
  route: DosageRoute;
  routeIndex?: number;
  plateauDosing?: SubstanceArticle["dosage"]["plateau_dosing"];
  disclaimer?: string;
  citationMarker: ReactNode;
  bioavailabilityContent: ReactNode;
  bioavailabilityNotesContent: ReactNode;
  notesContent: ReactNode;
  plateauEffectsContent: Readonly<Record<string, ReactNode>>;
  plateauNotesContent: ReactNode;
}

export function DosagePanelView({
  route,
  routeIndex,
  plateauDosing,
  disclaimer = DOSAGE_PANEL_DISCLAIMER_FALLBACK,
  citationMarker,
  bioavailabilityContent,
  bioavailabilityNotesContent,
  notesContent,
  plateauEffectsContent,
  plateauNotesContent,
}: DosagePanelViewProps) {
  const t = useT();
  const [mode, setMode] = useState("traditional");
  return (
    <div className="theme-dose-duration-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="theme-text-primary flex items-center gap-2 text-sm font-semibold">
          <Icon
            icon="charm:chart-bar"
            size={20}
            className="theme-accent-emphasis"
          />
          {t("Dosage")}
          {citationMarker}
        </h3>
      </div>

      <ArticleDisclaimer text={disclaimer} />

      {plateauDosing ? (
        <Tabs value={mode} onValueChange={setMode} className="w-full">
          <TabsList className="theme-dosage-mode-tabs mb-3 h-auto p-1">
            <TabsTrigger
              value="traditional"
              className="theme-dosage-mode-tab min-h-8 px-3 py-1 text-xs duration-200 ease-out motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11"
            >
              {t("Traditional")}
            </TabsTrigger>
            <TabsTrigger
              value="plateau"
              className="theme-dosage-mode-tab min-h-8 px-3 py-1 text-xs duration-200 ease-out motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11"
            >
              {t("Plateau")}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="traditional"
            forceMount
            hidden={mode !== "traditional"}
            className={
              mode === "traditional" ? "theme-tab-panel-enter" : undefined
            }
          >
            <DoseTiersTable
              route={route}
              routeIndex={routeIndex}
              bioavailabilityContent={bioavailabilityContent}
              bioavailabilityNotesContent={bioavailabilityNotesContent}
              notesContent={notesContent}
            />
          </TabsContent>
          <TabsContent
            value="plateau"
            forceMount
            hidden={mode !== "plateau"}
            className={mode === "plateau" ? "theme-tab-panel-enter" : undefined}
          >
            <PlateauTiersTable
              plateauDosing={plateauDosing}
              effectsContent={plateauEffectsContent}
              notesContent={plateauNotesContent}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <DoseTiersTable
          route={route}
          routeIndex={routeIndex}
          bioavailabilityContent={bioavailabilityContent}
          bioavailabilityNotesContent={bioavailabilityNotesContent}
          notesContent={notesContent}
        />
      )}
    </div>
  );
}
