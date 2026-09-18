import type { ParsedDosageRoute, ParsedDurationRoute } from "../types";

import {
  extractSection,
  extractSubsections,
  normalizeRoute,
  parseDoseRange,
  parseDurationRange,
  cleanMarkdown,
} from "../base";

function parseDosageContent(
  content: string,
  sourceId: string,
  routeName: string,
): ParsedDosageRoute | null {
  const ranges: ParsedDosageRoute["ranges"] = {};
  let bioavailability: string | undefined;

  const bioMatch = content.match(/Bioavailability:\s*([^\n]+)/i);
  if (bioMatch) {
    bioavailability = cleanMarkdown(bioMatch[1]);
  }

  for (const line of content.split("\n")) {
    const match = line.match(/^-\s*(Threshold|Light|Common|Strong|Heavy):\s*(.+)$/i);
    if (!match) continue;

    const parsed = parseDoseRange(match[2].trim());
    if (!parsed) continue;

    const category = match[1].toLowerCase();
    if (category === "threshold") ranges.threshold = parsed;
    else if (category === "light") ranges.light = parsed;
    else if (category === "common") ranges.common = parsed;
    else if (category === "strong") ranges.strong = parsed;
    else if (category === "heavy") ranges.heavy = parsed;
  }

  if (Object.keys(ranges).length === 0) return null;

  return {
    route: normalizeRoute(routeName),
    source: sourceId,
    confidence: "high",
    bioavailability,
    ranges,
  };
}

function parseDurationContent(
  content: string,
  sourceId: string,
  routeName: string,
): ParsedDurationRoute | null {
  const stages: ParsedDurationRoute["stages"] = {};

  for (const line of content.split("\n")) {
    const match = line.match(/^-\s*(Total|Onset|Come\s*up|Peak|Offset|After\s*effects):\s*(.+)$/i);
    if (!match) continue;

    const parsed = parseDurationRange(match[2].trim());
    if (!parsed) continue;

    const stage = match[1].toLowerCase().replace(/\s+/g, "");
    if (stage === "total") stages.total = parsed;
    else if (stage === "onset") stages.onset = parsed;
    else if (stage === "comeup") stages.comeUp = parsed;
    else if (stage === "peak") stages.peak = parsed;
    else if (stage === "offset") stages.offset = parsed;
    else if (stage === "aftereffects") stages.afterEffects = parsed;
  }

  if (Object.keys(stages).length === 0) return null;

  return {
    route: normalizeRoute(routeName),
    source: sourceId,
    confidence: "high",
    stages,
  };
}

export function parseDosageAndDuration(
  content: string,
  sourceId: string,
): { dosage: ParsedDosageRoute[]; duration: ParsedDurationRoute[] } {
  const section = extractSection(content, "Dosage & Duration", 2);
  if (!section) return { dosage: [], duration: [] };

  const dosage: ParsedDosageRoute[] = [];
  const duration: ParsedDurationRoute[] = [];

  for (const [routeName, routeContent] of extractSubsections(section, 3)) {
    const dosageMatch = routeContent.match(/\*\*Dosage:\*\*[\s\S]*?(?=\*\*Duration:\*\*|$)/i);
    if (dosageMatch) {
      const parsed = parseDosageContent(dosageMatch[0], sourceId, routeName);
      if (parsed) dosage.push(parsed);
    }

    const durationMatch = routeContent.match(/\*\*Duration:\*\*[\s\S]*/i);
    if (durationMatch) {
      const parsed = parseDurationContent(durationMatch[0], sourceId, routeName);
      if (parsed) duration.push(parsed);
    }
  }

  return { dosage, duration };
}
