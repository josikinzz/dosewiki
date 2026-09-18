import { memo, type ReactNode } from "react";
import type { DosageRoute, DurationRoute, SubstanceArticle } from "@/schema";
import {
  hasDosageContent,
  hasDurationContent,
  routeHasDosageContent,
  routeHasDurationContent,
} from "@/schema/substance/dosageDurationPresence";
import { normalizeRouteName } from "../../../../../lib/article/normalization.mjs";
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
}

interface RouteGroup {
  dosage: Array<{ route: DosageRoute; index: number }>;
  duration: Array<{ route: DurationRoute; index: number }>;
}

function getCanonicalRouteName(route: string | null | undefined): string {
  const raw = typeof route === "string" ? route : "";
  return normalizeRouteName(raw) || raw.trim();
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
/** Pure server-compatible projection boundary around the route tab controller. */
export const DosageDurationSection = memo(function DosageDurationSection({
  article,
  dosageDisclaimer,
}: DosageDurationSectionProps) {
  const { dosage, duration } = article;
  const groups = new Map<string, RouteGroup>();
  const groupFor = (rawRoute: string) => {
    const canonicalRoute = getCanonicalRouteName(rawRoute);
    if (!canonicalRoute) return null;
    const existing = groups.get(canonicalRoute);
    if (existing) return existing;
    const created: RouteGroup = { dosage: [], duration: [] };
    groups.set(canonicalRoute, created);
    return created;
  };
  dosage.routes.forEach((route, index) =>
    groupFor(route.route)?.dosage.push({ route, index }),
  );
  duration.routes.forEach((route, index) =>
    groupFor(route.route)?.duration.push({ route, index }),
  );

  const projected = new Map<
    string,
    {
      dosage?: DosageRoute;
      dosageIndex?: number;
      duration?: DurationRoute;
      durationIndex?: number;
    }
  >();
  groups.forEach((group, canonicalRoute) => {
    const dosageEntry = group.dosage.find((entry) =>
      routeHasDosageContent(entry.route),
    );
    const durationEntry = group.duration.find((entry) =>
      routeHasDurationContent(entry.route),
    );
    projected.set(canonicalRoute, {
      dosage: dosageEntry?.route,
      dosageIndex: dosageEntry?.index,
      duration: durationEntry?.route,
      durationIndex: durationEntry?.index,
    });
  });

  const hasDosage = hasDosageContent(dosage);
  const hasDuration = hasDurationContent(duration);
  const plateauNeedsHost =
    hasDosageContent({ routes: [], plateau_dosing: dosage.plateau_dosing }) &&
    !Array.from(projected.values()).some((entry) => entry.dosage);
  let routeKeys = Array.from(projected.entries())
    .filter(([, entry]) => entry.dosage || entry.duration)
    .map(([key]) => key);
  if (routeKeys.length === 0 && plateauNeedsHost) {
    routeKeys = Array.from(groups.entries())
      .filter(([, group]) => group.dosage.length > 0)
      .map(([key]) => key);
  }

  if ((!hasDosage && !hasDuration) || routeKeys.length === 0) {
    return <ArticleGapNotice article={article} section="dosage_duration" />;
  }

  const firstWithContent = routeKeys.find((key) => {
    const entry = projected.get(key);
    return Boolean(entry?.dosage || entry?.duration);
  });
  const initialRoute = firstWithContent ?? routeKeys[0] ?? "oral";
  const routes: DosageDurationRouteView[] = routeKeys.map((key) => {
    const entry = projected.get(key);
    const plateauHost = plateauNeedsHost
      ? groups.get(key)?.dosage[0]
      : undefined;
    const dosageRoute = entry?.dosage ?? plateauHost?.route;
    const dosageIndex = entry?.dosage ? entry.dosageIndex : plateauHost?.index;
    const durationRoute = entry?.duration;
    const hasBothPanels = Boolean(dosageRoute && durationRoute);
    return {
      key,
      label: getRouteLabelKey(key),
      icon: ROUTE_ICONS[key.toLowerCase()],
      panel: (
        <div
          className={`relative grid items-start gap-4 ${hasBothPanels ? "md:grid-cols-2" : "md:grid-cols-1"}`}
        >
          {dosageRoute ? (
            <DosagePanel
              route={dosageRoute}
              routeIndex={dosageIndex}
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
              routeIndex={entry?.durationIndex}
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
    <DosageDurationSectionView routes={routes} initialRoute={initialRoute} />
  );
});
