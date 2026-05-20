import type { ParsedInternationalLaw, ParsedLegalStatus } from "../types";

import { cleanMarkdown, extractStatusAndNotes, normalizeCountry } from "../base";

import { extractErowidMarkdownSection, extractErowidSubsection } from "./sections";

export interface LegalParseResult {
  legal: ParsedLegalStatus[];
  internationalLaw: ParsedInternationalLaw[];
}

export function parseLegalSection(content: string, sourceId: string): LegalParseResult {
  const lawSection =
    extractErowidMarkdownSection(content, "Law") || extractErowidSubsection(content, "Law");
  if (!lawSection) return { legal: [], internationalLaw: [] };

  const legal: ParsedLegalStatus[] = [];
  const internationalLaw: ParsedInternationalLaw[] = [];

  if (lawSection.includes("1971 Convention") || lawSection.includes("Psychotropic Substances")) {
    internationalLaw.push({
      treaty: "UN Convention on Psychotropic Substances 1971",
      source: sourceId,
    });
  }
  if (lawSection.includes("1961 Convention") || lawSection.includes("Single Convention on Narcotic")) {
    internationalLaw.push({
      treaty: "Single Convention on Narcotic Drugs 1961",
      source: sourceId,
    });
  }
  if (lawSection.includes("1988 Convention") || lawSection.includes("Against Illicit Traffic")) {
    internationalLaw.push({
      treaty: "UN Convention Against Illicit Traffic 1988",
      source: sourceId,
    });
  }

  const federalSection = extractErowidSubsection(lawSection, "U.S. FEDERAL LAW");
  if (federalSection) {
    const scheduleMatch = federalSection.match(/Schedule\s*([IVX]+)/i);
    if (scheduleMatch) {
      legal.push({
        country: "United States",
        status: `Schedule ${scheduleMatch[1]}`,
        details: cleanMarkdown(federalSection),
        source: sourceId,
      });
    } else {
      const statusMatch = federalSection.match(/(unscheduled|not scheduled|controlled|illegal|legal)/i);
      if (statusMatch) {
        legal.push({
          country: "United States",
          status: statusMatch[1],
          details: cleanMarkdown(federalSection),
          source: sourceId,
        });
      }
    }
  }

  const internationalSection = extractErowidSubsection(lawSection, "INTERNATIONAL LAW");
  if (internationalSection) {
    const countryPattern = /^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*#\s*$/gm;
    let countryMatch: RegExpExecArray | null;
    const countryMatches: Array<{ name: string; index: number }> = [];

    while ((countryMatch = countryPattern.exec(internationalSection)) !== null) {
      countryMatches.push({ name: countryMatch[1], index: countryMatch.index });
    }

    for (let i = 0; i < countryMatches.length; i++) {
      const rawCountry = countryMatches[i].name;
      const startIdx = countryMatches[i].index + rawCountry.length + 2;
      const endIdx = countryMatches[i + 1]?.index ?? internationalSection.length;
      const countryContent = internationalSection.slice(startIdx, endIdx).trim();

      if (countryContent.length > 5) {
        const cleaned = cleanMarkdown(countryContent);
        const { status, notes } = extractStatusAndNotes(cleaned);
        legal.push({
          country: normalizeCountry(rawCountry),
          status,
          details: notes || undefined,
          source: sourceId,
        });
      }
    }
  }

  return { legal, internationalLaw };
}
