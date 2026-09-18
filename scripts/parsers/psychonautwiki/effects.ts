import type { ParsedEffect } from "../types";

import { cleanMarkdown, extractSection, stripReferences } from "../base";

function parseEffectList(content: string, sourceId: string): ParsedEffect[] {
  const effects: ParsedEffect[] = [];

  for (const line of content.split("\n")) {
    const linkedMatch = line.match(/^\s*-\s*-?\s*\*\*\[([^\]]+)\]\([^)]+\)\*\*(?:\s*-\s*(.+))?$/);
    if (linkedMatch) {
      effects.push({
        name: cleanMarkdown(linkedMatch[1]),
        description: linkedMatch[2] ? stripReferences(cleanMarkdown(linkedMatch[2])) : undefined,
        source: sourceId,
      });
      continue;
    }

    const simpleMatch = line.match(/^\s*-\s*-?\s*\*\*([^*[\]]+)\*\*/);
    if (simpleMatch) {
      effects.push({
        name: cleanMarkdown(simpleMatch[1]),
        source: sourceId,
      });
    }
  }

  return effects;
}

export function parseSubjectiveEffects(content: string, sourceId: string): ParsedEffect[] {
  const section = extractSection(content, "Subjective effects", 2);
  if (!section) return [];

  const effects: ParsedEffect[] = [];
  const domains = [
    "Physical effects",
    "Visual effects",
    "Cognitive effects",
    "Auditory effects",
  ];

  for (const domain of domains) {
    const domainSection = extractSection(section, domain, 3);
    if (domainSection) {
      effects.push(...parseEffectList(domainSection, sourceId));
    }
  }

  return effects;
}
