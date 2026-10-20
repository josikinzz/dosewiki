import { memo, type ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import { projectDosageDurationRoutes } from "@/schema/substance/dosageDurationProjection";
import { CitedText, CitationMarker } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";
import { DosagePanel } from "./dosageDurationPlateau";
import { DurationPanel } from "./dosageDurationShared";
import { ROUTE_ICONS, getRouteLabelKey } from "./dosageDurationModel";
import {
  DosageDurationSectionView,
  type DosageDurationRouteView,
} from "./DosageDurationSectionView.client";

interface DosageDurationSectionProps {
  article: SubstanceArticle;
  dosageDisclaimer?: string;
  piruSlug?: string;
}

function renderNoteLines(
  article: SubstanceArticle,
  text: string | null | undefined,
): ReactNode {
  return (
    <ul className="space-y-1">
      {(text ?? "")
        .split("\n")
        .filter((line) => line.trim())
        .map((line, index) => (
          <li
            key={index}
            className="theme-text-muted flex gap-2 text-xs leading-relaxed"
          >
            <span className="theme-accent-emphasis select-none">•</span>
            <span>
              <CitedText
                text={line.replace(/^[•\-*]\s*/, "").trim()}
                article={article}
              />
            </span>
          </li>
        ))}
    </ul>
  );
}
export const DosageDurationSection = memo(function DosageDurationSection({
  article,
  dosageDisclaimer,
  piruSlug,
}: DosageDurationSectionProps) {
  const { dosage, duration } = article;
  const panels = projectDosageDurationRoutes(
    dosage.routes,
    duration.routes,
    dosage.plateau_dosing,
  );

  if (panels.length === 0) {
    return <ArticleGapNotice article={article} section="dosage_duration" />;
  }

  const routes: DosageDurationRouteView[] = panels.map((panel) => {
    const dosageRoute = panel.dosage?.route;
    const durationRoute = panel.duration?.route;
    const hasBothPanels = Boolean(dosageRoute && durationRoute);
    return {
      key: panel.key,
      label: getRouteLabelKey(panel.key),
      icon: ROUTE_ICONS[panel.key.toLowerCase()],
      panel: (
        <div
          className={`relative grid items-start gap-4 ${hasBothPanels ? "md:grid-cols-2" : "md:grid-cols-1"}`}
        >
          {dosageRoute ? (
            <DosagePanel
              route={dosageRoute}
              routeIndex={panel.dosage?.index}
              plateauDosing={dosage.plateau_dosing}
              disclaimer={dosageDisclaimer}
              citationMarker={
                <CitationMarker
                  article={article}
                  referenceIds={dosageRoute.reference_ids}
                />
              }
              bioavailabilityContent={
                <CitedText
                  text={dosageRoute.bioavailability ?? ""}
                  article={article}
                />
              }
              bioavailabilityNotesContent={renderNoteLines(
                article,
                dosageRoute.bioavailability_notes,
              )}
              notesContent={
                <CitedText text={dosageRoute.notes} article={article} />
              }
              plateauEffectsContent={Object.fromEntries(
                Object.entries(dosage.plateau_dosing ?? {}).map(
                  ([plateauKey, plateau]) => [
                    plateauKey,
                    typeof plateau === "object" && plateau ? (
                      <CitedText
                        key={plateauKey}
                        text={plateau.effects ?? ""}
                        article={article}
                      />
                    ) : null,
                  ],
                ),
              )}
              plateauNotesContent={
                <CitedText
                  text={dosage.plateau_dosing?.notes ?? ""}
                  article={article}
                />
              }
            />
          ) : null}
          {durationRoute ? (
            <DurationPanel
              route={durationRoute}
              routeIndex={panel.duration?.index}
              citationMarker={
                <CitationMarker
                  article={article}
                  referenceIds={durationRoute.reference_ids}
                />
              }
              halfLifeContent={
                <CitedText
                  text={durationRoute.half_life ?? ""}
                  article={article}
                />
              }
              halfLifeNotesContent={renderNoteLines(
                article,
                durationRoute.half_life_notes,
              )}
            />
          ) : null}
        </div>
      ),
    };
  });

  return (
    <DosageDurationSectionView
      routes={routes}
      initialRoute={panels[0].key}
      piruSlug={piruSlug}
    />
  );
});
