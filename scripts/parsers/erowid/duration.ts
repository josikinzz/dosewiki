import type { ParsedDurationRoute } from "../types";

import { extractErowidMarkdownSection, extractErowidSubsection } from "./sections";

const ROUTE_MAP: Record<string, string> = {
  oral: "Oral",
  insufflated: "Insufflated",
  nasal: "Insufflated",
  smoked: "Smoked",
  vapourised: "Smoked",
  vaporized: "Smoked",
  im: "Intramuscular",
  intramuscular: "Intramuscular",
  iv: "Intravenous",
  intravenous: "Intravenous",
  sublingual: "Sublingual",
  buccal: "Buccal",
  rectal: "Rectal",
  plugged: "Rectal",
  transdermal: "Transdermal",
};

function normalizeRouteName(route: string): string {
  const normalized = route.toLowerCase().trim();
  return ROUTE_MAP[normalized] || route;
}

function normalizeTimeUnit(unit: string): "hours" | "minutes" {
  const normalized = unit.toLowerCase();
  if (
    normalized.startsWith("h") ||
    normalized === "hours" ||
    normalized === "hour" ||
    normalized === "hrs" ||
    normalized === "hr"
  ) {
    return "hours";
  }
  return "minutes";
}

function parseErowidDurationStages(content: string): ParsedDurationRoute["stages"] {
  const stages: ParsedDurationRoute["stages"] = {};
  const stagePatterns: Array<{
    names: string[];
    key: keyof ParsedDurationRoute["stages"];
  }> = [
    { names: ["Total Duration", "Total", "Duration"], key: "total" },
    { names: ["Onset"], key: "onset" },
    { names: ["Coming Up", "Come Up", "Comeup", "Come-up"], key: "comeUp" },
    { names: ["Peak", "Plateau"], key: "peak" },
    { names: ["Coming Down", "Come Down", "Comedown", "Come-down", "Offset"], key: "offset" },
    {
      names: ["Normal After Effects", "After Effects", "Aftereffects", "After-effects", "After effects"],
      key: "afterEffects",
    },
  ];

  for (const { names, key } of stagePatterns) {
    for (const name of names) {
      const escapedName = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const rangePattern = new RegExp(
        `-?\\s*${escapedName}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*[-–]\\s*(\\d+(?:\\.\\d+)?)\\s*(mins?|minutes?|hrs?|hours?|secs?|seconds?)`,
        "i",
      );
      let match = content.match(rangePattern);
      if (match) {
        let min = parseFloat(match[1]);
        let max = parseFloat(match[2]);
        let unit = normalizeTimeUnit(match[3]);

        if (match[3].toLowerCase().startsWith("sec")) {
          min /= 60;
          max /= 60;
          unit = "minutes";
        }

        stages[key] = { min, max, unit };
        break;
      }

      const upToPattern = new RegExp(
        `-?\\s*${escapedName}\\s*:?\\s*up\\s+to\\s+(\\d+(?:\\.\\d+)?)\\s*(mins?|minutes?|hrs?|hours?)`,
        "i",
      );
      match = content.match(upToPattern);
      if (match) {
        stages[key] = {
          min: 0,
          max: parseFloat(match[1]),
          unit: normalizeTimeUnit(match[2]),
        };
        break;
      }

      const singlePattern = new RegExp(
        `-?\\s*${escapedName}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*(mins?|minutes?|hrs?|hours?|secs?|seconds?)`,
        "i",
      );
      match = content.match(singlePattern);
      if (match) {
        let value = parseFloat(match[1]);
        let unit = normalizeTimeUnit(match[2]);

        if (match[2].toLowerCase().startsWith("sec")) {
          value /= 60;
          unit = "minutes";
        }

        stages[key] = { min: value, max: value, unit };
        break;
      }
    }
  }

  return stages;
}

export function parseDurationSection(content: string, sourceId: string): ParsedDurationRoute[] {
  const effectsSection = extractErowidMarkdownSection(content, "Effects");
  const durationSubsection = effectsSection
    ? extractErowidSubsection(effectsSection, "DURATION")
    : extractErowidSubsection(content, "DURATION") ||
      extractErowidSubsection(content, "Duration") ||
      extractErowidMarkdownSection(content, "Duration");

  const hasDurationData = content.match(
    /-?\s*(Total Duration|Duration|Onset|Peak|Plateau|Coming Up|Coming Down|After Effects|Normal After Effects)\s*:?\s*\d/i,
  );

  let searchContent = durationSubsection || content;
  if (durationSubsection) {
    const subsectionHasData = durationSubsection.match(/(Onset|Duration|Peak|Coming)\s*:?\s*\d/i);
    if (!subsectionHasData && hasDurationData) {
      searchContent = content;
    }
  }

  if (!durationSubsection && !hasDurationData) return [];

  const routes: ParsedDurationRoute[] = [];
  const routePattern = /\*\*([A-Za-z/]+)\*\*/g;
  const routeMatches = [...searchContent.matchAll(routePattern)];

  if (routeMatches.length > 0) {
    for (let i = 0; i < routeMatches.length; i++) {
      const routeName = routeMatches[i][1];
      if (routeName.toLowerCase().includes("duration") || routeName.length > 15) {
        continue;
      }

      const startIdx = routeMatches[i].index! + routeMatches[i][0].length;
      const endIdx = routeMatches[i + 1]?.index ?? searchContent.length;
      const routeContent = searchContent.slice(startIdx, endIdx);
      const stages = parseErowidDurationStages(routeContent);

      if (Object.keys(stages).length > 0) {
        routes.push({
          route: normalizeRouteName(routeName),
          source: sourceId,
          confidence: "medium",
          stages,
        });
      }
    }
  }

  if (routes.length === 0) {
    const stages = parseErowidDurationStages(searchContent);
    if (Object.keys(stages).length > 0) {
      routes.push({
        route: "Oral",
        source: sourceId,
        confidence: durationSubsection ? "medium" : "low",
        stages,
      });
    }
  }

  return routes;
}
