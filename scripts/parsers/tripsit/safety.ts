import type { ParsedInteraction, ParsedTolerance } from "../types";

import {
  cleanMarkdown,
  detectInteractionSeverity,
  extractSection,
  extractSubsections,
} from "../base";

export function parseInteractionsSection(content: string, sourceId: string): ParsedInteraction[] {
  const interactionsSection = extractSection(content, "Interactions", 2);
  if (!interactionsSection) return [];

  const interactions: ParsedInteraction[] = [];
  const categories = [
    { pattern: /dangerous/i, severity: "dangerous" as const },
    { pattern: /unsafe/i, severity: "unsafe" as const },
    { pattern: /caution/i, severity: "caution" as const },
    { pattern: /low risk.*synergy/i, severity: "low-risk-synergy" as const },
    { pattern: /low risk.*decrease/i, severity: "low-risk-decrease" as const },
    { pattern: /low risk.*no synergy/i, severity: "low-risk-no-synergy" as const },
  ];

  const subsections = extractSubsections(interactionsSection, 3);
  for (const [sectionName, sectionContent] of subsections) {
    let severity: ParsedInteraction["severity"] = "caution";
    for (const category of categories) {
      if (category.pattern.test(sectionName)) {
        severity = category.severity;
        break;
      }
    }

    for (const line of sectionContent.split("\n")) {
      const match = line.match(/^\s*[-*]\s*\*?\*?([^*:]+)\*?\*?:?\s*(.*)?$/);
      if (!match) continue;

      const substance = match[1].trim();
      const description = match[2]?.trim();
      if (substance && !substance.match(/^[-=]+$/)) {
        interactions.push({
          substance: cleanMarkdown(substance),
          severity,
          description: description ? cleanMarkdown(description) : undefined,
          source: sourceId,
        });
      }
    }
  }

  const otherSection = subsections.get("other");
  if (otherSection) {
    for (const line of otherSection.split("\n")) {
      const match = line.match(/^\s*[-*]\s*\*?\*?([^*()]+)\*?\*?\s*\(([^)]+)\)/);
      if (match) {
        interactions.push({
          substance: cleanMarkdown(match[1].trim()),
          severity: detectInteractionSeverity(match[2].toLowerCase()),
          source: sourceId,
        });
      }
    }
  }

  return interactions;
}

export function parseToleranceSection(content: string, sourceId: string): ParsedTolerance | undefined {
  const toleranceSection = extractSection(content, "Tolerance", 2);
  if (!toleranceSection || toleranceSection.trim().length < 50) return undefined;

  return {
    rawText: toleranceSection.replace(/\s+/g, " ").trim(),
    source: sourceId,
  };
}
