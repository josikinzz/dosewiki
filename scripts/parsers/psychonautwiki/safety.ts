import type { ParsedHarmReduction, ParsedInteraction, ParsedTolerance } from "../types";

import {
  cleanMarkdown,
  extractBulletList,
  extractSection,
  stripMarkdownLinks,
  stripReferences,
} from "../base";

export function parseToxicitySection(
  content: string,
  sourceId: string,
): { interactions: ParsedInteraction[]; harmReduction: ParsedHarmReduction | undefined } {
  const section = extractSection(content, "Toxicity and harm potential", 2);
  if (!section) return { interactions: [], harmReduction: undefined };

  const interactions: ParsedInteraction[] = [];
  const dangerousSections = [
    extractSection(section, "Dangerous interactions", 3),
    extractSection(section, "Dangerous interactions", 4),
  ].filter(Boolean);

  for (const dangerousSection of dangerousSections) {
    for (const line of dangerousSection!.split("\n")) {
      const match = line.match(/^\s*-\s*\*\*([^*]+)\*\*(?:\s*(?:[-–—:])\s*(.+))?$/);
      if (!match) continue;

      const substance = cleanMarkdown(match[1]);
      const description = match[2] ? stripReferences(cleanMarkdown(match[2])) : undefined;
      if (!substance.toLowerCase().includes("warning") && substance.length > 0 && substance.length < 100) {
        interactions.push({
          substance,
          severity: "dangerous",
          description,
          source: sourceId,
        });
      }
    }
  }

  const serotoninSection = extractSection(section, "Serotonin syndrome risk", 3);
  if (serotoninSection) {
    for (const line of serotoninSection.split("\n")) {
      const match = line.match(/^\s*-\s*\*\*([^*]+)\*\*(?:\s*(?:[-–—:])\s*(.+))?$/);
      if (!match) continue;

      const substance = cleanMarkdown(match[1]);
      const description = match[2] ? stripReferences(cleanMarkdown(match[2])) : undefined;
      if (!substance.toLowerCase().includes("maoi") && substance.length > 0 && substance.length < 100) {
        interactions.push({
          substance,
          severity: "dangerous",
          description: description || "Serotonin syndrome risk",
          source: sourceId,
        });
      }
    }
  }

  const harmRules: string[] = [];
  const risks: string[] = [];
  const introMatch = section.match(/^[\s\S]*?(?=###|$)/);
  if (introMatch) {
    for (const bullet of extractBulletList(introMatch[0])) {
      const cleaned = stripReferences(cleanMarkdown(bullet));
      if (cleaned.length > 10 && cleaned.length < 500) {
        if (
          cleaned.toLowerCase().includes("advised") ||
          cleaned.toLowerCase().includes("recommend") ||
          cleaned.toLowerCase().includes("should")
        ) {
          harmRules.push(cleaned);
        } else {
          risks.push(cleaned);
        }
      }
    }
  }

  const harmReduction =
    harmRules.length > 0 || risks.length > 0
      ? {
          rules: harmRules,
          shortTermRisks: risks,
          sources: [sourceId],
        }
      : undefined;

  return { interactions, harmReduction };
}

export function parseTolerance(content: string, sourceId: string): ParsedTolerance | undefined {
  const patterns = [
    /#{2,4}\s*(?:tolerance|dependence|addiction)[^#\n]*\n([\s\S]*?)(?=\n#{2,4}\s|$)/i,
    /\*\*[^*]*tolerance[^*]*:?\*\*\s*\n?([\s\S]*?)(?=\n\*\*[A-Z]|\n#{2,4}|$)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match?.[1]) continue;

    const rawText = stripMarkdownLinks(match[1]).replace(/\s+/g, " ").trim();
    if ((rawText.startsWith("*Warning") || rawText.startsWith("Warning")) || rawText.length <= 100) {
      continue;
    }

    return { rawText, source: sourceId };
  }

  return undefined;
}
