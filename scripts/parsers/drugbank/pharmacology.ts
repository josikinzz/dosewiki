import type { ParsedPharmacology } from "../types";

import { cleanMarkdown, extractSection, stripReferences } from "../base";

function cleanSectionText(text: string): string {
  let cleaned = stripReferences(cleanMarkdown(text)).replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/([.!?)])\s+\d{1,3}(?:,\s*\d{1,3})*\s+([A-Z])/g, "$1 $2");
  cleaned = cleaned.replace(/\s+\d{1,3}(?:,\s*\d{1,3})*\.?$/, "");
  cleaned = cleaned.replace(
    /^((Pharmacokinetics|Pharmacology|Metabolism|Absorption|Elimination|Bioavailability|Half-life)\s+)+/i,
    "",
  );
  cleaned = cleaned.replace(/\s*Label\s*\.?/gi, "").trim();
  if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) cleaned += ".";
  return cleaned.replace(/\.+/g, ".");
}

export function parsePharmacologySection(
  content: string,
  sourceId: string,
): Partial<ParsedPharmacology> {
  const pharmacology: Partial<ParsedPharmacology> = { sources: [sourceId] };

  for (const [heading, field] of [
    ["Half-life", "halfLife"],
    ["Absorption", "bioavailability"],
    ["Metabolism", "metabolism"],
  ] as const) {
    const section = extractSection(content, heading, 3);
    if (!section) continue;
    const cleaned = cleanSectionText(section);
    if (cleaned.length > 10) pharmacology[field] = cleaned;
  }

  const mechanismSection = extractSection(content, "Mechanism of Action", 3);
  if (mechanismSection) {
    const receptors: Array<{ name: string; action: string }> = [];
    let currentReceptor = "";
    for (const line of mechanismSection.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^(Agonist|Antagonist|Inhibitor|Potentiator|Modulator|Negative modulator|Positive modulator)/i.test(trimmed)) {
        if (currentReceptor) {
          receptors.push({ name: currentReceptor, action: trimmed.toLowerCase() });
        }
        currentReceptor = "";
      } else if (trimmed.length > 2 && !trimmed.startsWith("+") && !trimmed.includes("more targets")) {
        currentReceptor = cleanMarkdown(trimmed);
      }
    }

    if (receptors.length > 0) {
      pharmacology.receptors = receptors;
      pharmacology.mechanismOfAction = receptors.map((receptor) => `${receptor.name}: ${receptor.action}`);
    }
  }

  const pharmacodynamicsSection = extractSection(content, "Pharmacodynamics", 3);
  if (pharmacodynamicsSection && !pharmacology.mechanismOfAction) {
    const cleaned = stripReferences(cleanMarkdown(pharmacodynamicsSection));
    const mechanisms: string[] = [];
    for (const pattern of [
      /acts?\s+as\s+(?:an?\s+)?([^.]+(?:agonist|antagonist|inhibitor))/gi,
      /(?:agonist|antagonist|inhibitor)\s+(?:at|of|for)\s+([^.]+receptors?)/gi,
    ]) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(cleaned)) !== null) {
        mechanisms.push(cleanMarkdown(match[1]));
      }
    }

    if (mechanisms.length > 0) {
      pharmacology.mechanismOfAction = mechanisms;
    }
  }

  return pharmacology;
}
