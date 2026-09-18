import type { DoseRange, ParsedDosageRoute } from "../types";

import { cleanMarkdown } from "../base";

import { extractErowidMarkdownSection, extractErowidSubsection } from "./sections";

const KNOWN_ROUTES = [
  "oral",
  "insufflated",
  "nasal",
  "smoked",
  "im",
  "i.m.",
  "iv",
  "i.v.",
  "intravenous",
  "intramuscular",
  "sublingual",
  "buccal",
  "rectal",
  "transdermal",
  "inhaled",
  "vaporized",
  "vapourised",
];

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

function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();
  if (normalized === "grams" || normalized === "gram") return "g";
  if (normalized === "µg" || normalized === "ug" || normalized === "mcg") return "µg";
  return normalized;
}

function assignRange(
  ranges: ParsedDosageRoute["ranges"],
  label: string,
  range: DoseRange,
) {
  switch (label.toLowerCase()) {
    case "threshold":
      ranges.threshold = range;
      break;
    case "light":
      ranges.light = range;
      break;
    case "common":
    case "moderate":
      ranges.common = range;
      break;
    case "strong":
      ranges.strong = range;
      break;
    case "heavy":
      ranges.heavy = range;
      break;
  }
}

function extractDosageNotes(section: string): string | undefined {
  const notesSection = extractErowidSubsection(section, "NOTES");
  if (notesSection && notesSection !== "None") {
    return cleanMarkdown(notesSection);
  }
  return undefined;
}

function normalizeRouteHeader(routeName: string): string | undefined {
  let normalizedRoute = routeName.trim();

  if (
    normalizedRoute.startsWith("(") ||
    normalizedRoute.toLowerCase().includes("created by") ||
    normalizedRoute.toLowerCase() === "many" ||
    normalizedRoute.toLowerCase().includes("onset") ||
    normalizedRoute.toLowerCase().includes("every individual")
  ) {
    return undefined;
  }

  const dashMatch = normalizedRoute.match(/dosages?\s*[-–]\s*(.+)/i);
  if (dashMatch) {
    normalizedRoute = dashMatch[1].split(/\s*[/,]\s*/)[0].trim();
  } else if (normalizedRoute.toLowerCase().includes("dosage")) {
    const beforeDosage = normalizedRoute.split(/\s+dosages?/i)[0].trim();
    normalizedRoute = beforeDosage.split(/\s*[/,]\s*/)[0].trim();
  }

  const routeWords = normalizedRoute.split(/\s+/);
  if (routeWords.length > 1) {
    if (KNOWN_ROUTES.includes(routeWords[0].toLowerCase())) {
      normalizedRoute = routeWords[0];
    } else if (KNOWN_ROUTES.includes(routeWords[routeWords.length - 1].toLowerCase())) {
      normalizedRoute = routeWords[routeWords.length - 1];
    }
  }

  if (!KNOWN_ROUTES.includes(normalizedRoute.toLowerCase())) {
    return undefined;
  }

  return normalizeRouteName(normalizedRoute);
}

function parseErowidDoseRanges(content: string): ParsedDosageRoute["ranges"] {
  const ranges: ParsedDosageRoute["ranges"] = {};
  let match: RegExpExecArray | null;

  const labeledPattern =
    /-?\s*(Threshold|Light|Common|Moderate|Strong|Heavy):?\s*[≤<]?~?(\d+(?:\.\d+)?)\s*[-–]?\s*(\d+(?:\.\d+)?)?\s*(mg|µg|ug|mcg|g|grams?|gram|ml)(?:\s+\w+)?/gi;

  while ((match = labeledPattern.exec(content)) !== null) {
    assignRange(ranges, match[1], {
      min: parseFloat(match[2]),
      max: match[3] ? parseFloat(match[3]) : parseFloat(match[2]),
      unit: normalizeUnit(match[4]),
    });
  }

  if (Object.keys(ranges).length === 0) {
    const pipePattern =
      /-\s*(Threshold|Light|Common|Moderate|Strong|Heavy|The K Hole)\s*\|[^|]+\|\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(mg|µg|ug|g|grams?|ml)/gi;

    while ((match = pipePattern.exec(content)) !== null) {
      const label = match[1].toLowerCase() === "the k hole" ? "heavy" : match[1];
      assignRange(ranges, label, {
        min: parseFloat(match[2]),
        max: parseFloat(match[3]),
        unit: normalizeUnit(match[4]),
      });
    }
  }

  if (Object.keys(ranges).length === 0) {
    const bulletPattern =
      /-\s*(Threshold|Light|Common|Moderate|Strong|Heavy)\s+[≤<]?(\d+(?:\.\d+)?)\s*[-–]?\s*(\d+(?:\.\d+)?)?\s*(mg|µg|ug|g|grams?|gram|ml)(?:\s+\w+)?/gi;

    while ((match = bulletPattern.exec(content)) !== null) {
      assignRange(ranges, match[1], {
        min: parseFloat(match[2]),
        max: match[3] ? parseFloat(match[3]) : parseFloat(match[2]),
        unit: normalizeUnit(match[4]),
      });
    }
  }

  if (!ranges.heavy) {
    const heavyPlusPattern =
      /-?\s*Heavy:?\s*(\d+(?:\.\d+)?)\s*\+?\s*(mg|µg|ug|g|grams?|ml)|(\d+(?:\.\d+)?)\s*\+\s*(mg|µg|ug|g|grams?|ml)/gi;
    match = heavyPlusPattern.exec(content);
    if (match) {
      const min = parseFloat(match[1] || match[3]);
      ranges.heavy = {
        min,
        max: min,
        unit: normalizeUnit(match[2] || match[4]),
      };
    }
  }

  return ranges;
}

export function parseDosageSection(content: string, sourceId: string): ParsedDosageRoute[] {
  const dosageSection =
    extractErowidMarkdownSection(content, "Dosage") ||
    extractErowidSubsection(content, "DOSAGE DESCRIPTION") ||
    extractErowidSubsection(content, "DOSAGE") ||
    extractErowidSubsection(content, "Dose") ||
    extractErowidSubsection(content, "DOSE");

  const searchContent = dosageSection || content;

  if (
    !dosageSection &&
    !content.match(/-?\s*(Threshold|Light|Common|Moderate|Strong|Heavy):?\s*[≤<]?~?\d/i)
  ) {
    return [];
  }

  const routes: ParsedDosageRoute[] = [];
  const routePattern = /\*\*([^*]+)\*\*/g;
  const routeMatches = [...searchContent.matchAll(routePattern)];

  if (routeMatches.length > 0) {
    for (let i = 0; i < routeMatches.length; i++) {
      const route = normalizeRouteHeader(routeMatches[i][1]);
      if (!route) continue;

      const startIdx = routeMatches[i].index! + routeMatches[i][0].length;
      const endIdx = routeMatches[i + 1]?.index ?? searchContent.length;
      const routeContent = searchContent.slice(startIdx, endIdx);
      const ranges = parseErowidDoseRanges(routeContent);

      if (Object.keys(ranges).length > 0) {
        routes.push({
          route,
          source: sourceId,
          confidence: "medium",
          ranges,
          notes: extractDosageNotes(searchContent),
        });
      }
    }
  }

  if (routes.length === 0) {
    const ranges = parseErowidDoseRanges(searchContent);
    if (Object.keys(ranges).length > 0) {
      routes.push({
        route: "Oral",
        source: sourceId,
        confidence: "low",
        ranges,
        notes: extractDosageNotes(searchContent),
      });
    }
  }

  return routes;
}
