import type { ParsedDosageRoute, ParsedDurationRoute } from "../types";

import {
  extractLabeledBullets,
  extractSection,
  extractSubsections,
  normalizeRoute,
  parseDoseRange,
  parseDurationRange,
  parseLabelValueTable,
} from "../base";
import {
  detectInlineRoutes,
  parseInlineMultiRouteDuration,
  parseNestedDurationDict,
  resolveRouteDurationValue,
} from "../tripsit-duration";

function parseDosageTable(content: string, sourceId: string): ParsedDosageRoute[] {
  const rows = parseLabelValueTable(content);
  if (rows.length === 0) return [];

  const ranges: ParsedDosageRoute["ranges"] = {};
  for (const [label, value] of rows) {
    const parsed = parseDoseRange(value);
    if (!parsed) continue;

    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes("threshold")) ranges.threshold = parsed;
    else if (lowerLabel.includes("light")) ranges.light = parsed;
    else if (lowerLabel.includes("common") || lowerLabel.includes("moderate")) ranges.common = parsed;
    else if (lowerLabel.includes("strong")) ranges.strong = parsed;
    else if (lowerLabel.includes("heavy")) ranges.heavy = parsed;
  }

  return Object.keys(ranges).length > 0
    ? [{ route: "Oral", source: sourceId, confidence: "medium", ranges }]
    : [];
}

export function parseDosageSection(content: string, sourceId: string): ParsedDosageRoute[] {
  const dosageSection = extractSection(content, "Dosage", 2);
  if (!dosageSection) return [];

  const routes: ParsedDosageRoute[] = [];
  const routeSubsections = extractSubsections(dosageSection, 3);

  for (const [routeName, routeContent] of routeSubsections) {
    const bullets = extractLabeledBullets(routeContent);
    const ranges: ParsedDosageRoute["ranges"] = {};
    let detectedUnit = "mg";

    for (const bullet of bullets) {
      const parsed = parseDoseRange(bullet.value);
      if (parsed?.unit) {
        detectedUnit = parsed.unit;
        break;
      }
    }

    for (const bullet of bullets) {
      const label = bullet.label.toLowerCase();
      const parsed = parseDoseRange(bullet.value);
      if (!parsed) continue;
      if (!parsed.unit) parsed.unit = detectedUnit;

      if (label.includes("threshold")) ranges.threshold = parsed;
      else if (label.includes("light")) ranges.light = parsed;
      else if (label.includes("common") || label.includes("moderate")) ranges.common = parsed;
      else if (label.includes("strong")) ranges.strong = parsed;
      else if (label.includes("heavy")) ranges.heavy = parsed;
    }

    const noteMatch = routeContent.match(/\*Note:\s*(.+?)\*/i);
    const notes = noteMatch ? noteMatch[1].trim() : undefined;

    if (Object.keys(ranges).length > 0) {
      routes.push({
        route: normalizeRoute(routeName),
        source: sourceId,
        confidence: "high",
        ranges,
        notes,
      });
    }
  }

  if (routes.length === 0) {
    const bullets = extractLabeledBullets(dosageSection);
    if (bullets.length > 0) {
      const ranges: ParsedDosageRoute["ranges"] = {};
      let detectedUnit = "mg";

      for (const bullet of bullets) {
        const parsed = parseDoseRange(bullet.value);
        if (parsed?.unit) {
          detectedUnit = parsed.unit;
          break;
        }
      }

      for (const bullet of bullets) {
        const label = bullet.label.toLowerCase();
        const parsed = parseDoseRange(bullet.value);
        if (!parsed) continue;
        if (!parsed.unit) parsed.unit = detectedUnit;

        if (label.includes("threshold")) ranges.threshold = parsed;
        else if (label.includes("light")) ranges.light = parsed;
        else if (label.includes("common") || label.includes("moderate")) ranges.common = parsed;
        else if (label.includes("strong")) ranges.strong = parsed;
        else if (label.includes("heavy")) ranges.heavy = parsed;
      }

      if (Object.keys(ranges).length > 0) {
        routes.push({
          route: "Oral",
          source: sourceId,
          confidence: "medium",
          ranges,
        });
      }
    }
  }

  routes.push(...parseDosageTable(dosageSection, sourceId));
  return routes;
}

function parseDurationContent(
  content: string,
  sourceId: string,
  routeName: string,
): ParsedDurationRoute | null {
  const stages: ParsedDurationRoute["stages"] = {};

  for (const bullet of extractLabeledBullets(content)) {
    const label = bullet.label.toLowerCase();

    const dictParsed = parseNestedDurationDict(bullet.value);
    if (dictParsed) {
      const routeData = resolveRouteDurationValue(dictParsed, routeName);
      if (routeData) {
        const parsed = parseDurationRange(`${routeData.value} ${routeData.unit}`);
        if (parsed) {
          if (label.includes("onset")) stages.onset = parsed;
          else if (label.includes("duration") || label.includes("total")) stages.total = parsed;
          else if (label.includes("after")) stages.afterEffects = parsed;
        }
      }
      continue;
    }

    const inlineParsed = parseInlineMultiRouteDuration(bullet.value);
    if (inlineParsed) {
      const routeData = resolveRouteDurationValue(inlineParsed, routeName);
      if (routeData) {
        const parsed = parseDurationRange(`${routeData.value} ${routeData.unit}`);
        if (parsed) {
          if (label.includes("onset")) stages.onset = parsed;
          else if (label.includes("duration") || label.includes("total")) stages.total = parsed;
          else if (label.includes("after")) stages.afterEffects = parsed;
        }
      }
      continue;
    }

    const parsed = parseDurationRange(bullet.value);
    if (!parsed) continue;

    if (label.includes("onset")) stages.onset = parsed;
    else if (label.includes("come up") || label.includes("comeup")) stages.comeUp = parsed;
    else if (label.includes("peak")) stages.peak = parsed;
    else if (label.includes("offset")) stages.offset = parsed;
    else if (label.includes("after") && label.includes("effect")) stages.afterEffects = parsed;
    else if (label.includes("duration") || label.includes("total")) stages.total = parsed;
  }

  for (const [label, value] of parseLabelValueTable(content)) {
    const parsed = parseDurationRange(value);
    if (!parsed) continue;

    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes("onset")) stages.onset = parsed;
    else if (lowerLabel.includes("come up") || lowerLabel.includes("comeup")) stages.comeUp = parsed;
    else if (lowerLabel.includes("peak")) stages.peak = parsed;
    else if (lowerLabel.includes("offset")) stages.offset = parsed;
    else if (lowerLabel.includes("after")) stages.afterEffects = parsed;
    else if (lowerLabel.includes("total") || lowerLabel.includes("duration")) stages.total = parsed;
  }

  if (Object.keys(stages).length === 0) return null;
  return {
    route: normalizeRoute(routeName),
    source: sourceId,
    confidence: "high",
    stages,
  };
}

export function parseDurationSection(content: string, sourceId: string): ParsedDurationRoute[] {
  const durationSection = extractSection(content, "Duration", 2);
  if (!durationSection) return [];

  const routes: ParsedDurationRoute[] = [];
  const routeSubsections = extractSubsections(durationSection, 3);

  if (routeSubsections.size > 0) {
    for (const [routeName, routeContent] of routeSubsections) {
      const duration = parseDurationContent(routeContent, sourceId, routeName);
      if (duration) routes.push(duration);
    }
    return routes;
  }

  const inlineRoutes = detectInlineRoutes(durationSection);
  if (inlineRoutes.length > 1) {
    for (const routeName of inlineRoutes) {
      const duration = parseDurationContent(durationSection, sourceId, routeName);
      if (duration) routes.push(duration);
    }
  } else if (inlineRoutes.length === 1) {
    const duration = parseDurationContent(durationSection, sourceId, inlineRoutes[0]);
    if (duration) routes.push(duration);
  } else {
    const duration = parseDurationContent(durationSection, sourceId, "Oral");
    if (duration) routes.push(duration);
  }

  return routes;
}
