import type { ParsedInternationalLaw, ParsedLegalStatus } from "../types";

import { cleanMarkdown, extractSection, extractStatusAndNotes, normalizeCountry, stripReferences } from "../base";

export interface LegalParseResult {
  legal: ParsedLegalStatus[];
  internationalLaw: ParsedInternationalLaw[];
}

export function parseLegalStatus(content: string, sourceId: string): LegalParseResult {
  const section = extractSection(content, "Legal status", 2);
  if (!section) return { legal: [], internationalLaw: [] };

  const legal: ParsedLegalStatus[] = [];
  const internationalLaw: ParsedInternationalLaw[] = [];
  const introMatch = section.match(/^([\s\S]*?)(?=\n\s*-\s*\*\*)/);
  const intro = introMatch ? introMatch[1] : section;

  if (intro.includes("1971 Convention") || intro.includes("Convention on Psychotropic Substances")) {
    internationalLaw.push({
      treaty: "UN Convention on Psychotropic Substances 1971",
      source: sourceId,
    });
  }
  if (intro.includes("1961 Convention") || intro.includes("Single Convention on Narcotic")) {
    internationalLaw.push({
      treaty: "Single Convention on Narcotic Drugs 1961",
      source: sourceId,
    });
  }
  if (intro.includes("1988 Convention") || intro.includes("Against Illicit Traffic")) {
    internationalLaw.push({
      treaty: "UN Convention Against Illicit Traffic 1988",
      source: sourceId,
    });
  }

  for (const line of section.split("\n")) {
    const match = line.match(/^\s*-\s*\*\*([^*:]+)\*\*\s*:\s*(.+)$/);
    if (!match) continue;

    const country = normalizeCountry(match[1].trim());
    const fullText = stripReferences(cleanMarkdown(match[2]));
    if (fullText.length === 0 || fullText.length >= 1000) continue;

    const { status, notes } = extractStatusAndNotes(fullText);
    legal.push({
      country,
      status,
      details: notes || undefined,
      source: sourceId,
    });
  }

  return { legal, internationalLaw };
}
