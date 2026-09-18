import type { ParsedInteraction } from "../types";

import { cleanMarkdown, extractSection } from "../base";

export function parseDrugInteractions(content: string, sourceId: string): ParsedInteraction[] {
  const section = extractSection(content, "Drug Interactions", 3);
  if (!section) return [];

  const interactions: ParsedInteraction[] = [];
  let currentSubstance = "";

  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (
      trimmed.includes("should not be interpreted") ||
      trimmed.includes("healthcare provider") ||
      trimmed.includes("experiencing an interaction") ||
      trimmed.includes("does not necessarily mean")
    ) {
      continue;
    }

    const lower = trimmed.toLowerCase();
    if (
      lower.includes("can be increased") ||
      lower.includes("can be decreased") ||
      lower.includes("may decrease") ||
      lower.includes("may increase") ||
      lower.includes("risk or severity") ||
      lower.includes("therapeutic efficacy") ||
      lower.includes("serum concentration") ||
      lower.includes("serum level") ||
      lower.includes("excretion rate") ||
      lower.includes("metabolism of") ||
      lower.includes("activities of") ||
      lower.includes("adverse effects") ||
      lower.includes("toxic effects") ||
      lower.includes("clearance of") ||
      lower.includes("absorption of") ||
      lower.includes("hypotensive effect") ||
      lower.includes("hypertensive effect") ||
      lower.includes("cns depression") ||
      lower.includes("serotonergic") ||
      lower.includes("qt prolongation") ||
      lower.includes("hepatotoxic") ||
      lower.includes("nephrotoxic") ||
      lower.includes("sedative")
    ) {
      if (currentSubstance) {
        let severity: ParsedInteraction["severity"] = "caution";
        if (
          lower.includes("serotonin syndrome") ||
          lower.includes("qt prolongation") ||
          lower.includes("torsades") ||
          lower.includes("fatal") ||
          lower.includes("death")
        ) {
          severity = "dangerous";
        } else if (
          lower.includes("contraindicated") ||
          lower.includes("avoid") ||
          lower.includes("severe") ||
          lower.includes("significant")
        ) {
          severity = "unsafe";
        }

        interactions.push({
          substance: currentSubstance,
          severity,
          description: cleanMarkdown(trimmed),
          source: sourceId,
        });
      }
      currentSubstance = "";
    } else if (trimmed.length > 1 && !trimmed.startsWith("+")) {
      currentSubstance = cleanMarkdown(trimmed);
    }
  }

  return interactions.slice(0, 50);
}

export function parseFoodInteractions(content: string): string[] {
  const section = extractSection(content, "Food Interactions", 3);
  if (!section) return [];

  const items: string[] = [];
  for (const line of section.split("\n")) {
    const rawTrimmed = line.trim();
    if (
      rawTrimmed.startsWith("## ") ||
      rawTrimmed.startsWith("**DrugBank ID") ||
      rawTrimmed.startsWith("**SMILES") ||
      rawTrimmed.startsWith("**Chemical") ||
      rawTrimmed.startsWith("**Synonyms") ||
      rawTrimmed === "Chemical Information"
    ) {
      break;
    }

    const cleaned = cleanMarkdown(rawTrimmed);
    if (cleaned.length > 2 && !rawTrimmed.startsWith("#") && !rawTrimmed.startsWith("**")) {
      items.push(cleaned);
    }
  }

  return items;
}
