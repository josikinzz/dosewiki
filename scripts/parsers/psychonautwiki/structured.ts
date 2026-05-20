import type { ParsedChemistry, ParsedPharmacology } from "../types";

import { cleanMarkdown, extractSection, extractSubsections, stripReferences } from "../base";

function cleanSectionText(text: string): string {
  let cleaned = stripReferences(cleanMarkdown(text)).replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(
    /^((Pharmacokinetics|Pharmacology|Metabolism|Absorption|Elimination|Bioavailability|Half-life)\s+)+/i,
    "",
  );
  cleaned = cleaned.replace(/\s*citation needed\s*/gi, " ").trim();
  if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }
  return cleaned;
}

export function parseChemistry(content: string, sourceId: string): Partial<ParsedChemistry> | undefined {
  const section = extractSection(content, "Chemistry", 2);
  if (!section) return undefined;

  const chemistry: Partial<ParsedChemistry> = { sources: [sourceId] };
  const smilesMatch = section.match(/SMILES[:\s]*`?([^`\n]+)`?/i);
  if (smilesMatch) chemistry.smiles = smilesMatch[1].trim();

  const iupacMatch = section.match(/IUPAC[:\s]*`?([^`\n]+)`?/i);
  if (iupacMatch && iupacMatch[1].trim().length >= 5) {
    chemistry.iupac = iupacMatch[1].trim();
  }

  const formulaMatch = section.match(/(?:molecular\s*)?formula[:\s]*`?([^`\n]+)`?/i);
  if (formulaMatch) chemistry.formula = formulaMatch[1].trim();

  const weightMatch = section.match(/(?:molecular\s*)?weight[:\s]*`?([^`\n]+)`?/i);
  if (weightMatch) chemistry.molecularWeight = weightMatch[1].trim();

  return Object.keys(chemistry).length > 1 ? chemistry : undefined;
}

export function parsePharmacology(
  content: string,
  sourceId: string,
): Partial<ParsedPharmacology> | undefined {
  const section = extractSection(content, "Pharmacology", 2);
  if (!section) return undefined;

  const pharmacology: Partial<ParsedPharmacology> = { sources: [sourceId] };
  const subsections = extractSubsections(section, 3);

  const halfLifeSubsection = subsections.get("half-life");
  if (halfLifeSubsection) {
    const cleaned = cleanSectionText(halfLifeSubsection);
    if (cleaned.length > 10) pharmacology.halfLife = cleaned;
  }

  const bioSubsection = subsections.get("bioavailability");
  if (bioSubsection) {
    const cleaned = cleanSectionText(bioSubsection);
    if (cleaned.length > 10) pharmacology.bioavailability = cleaned;
  }

  const metabolismSubsection = subsections.get("metabolism");
  if (metabolismSubsection) {
    const cleaned = cleanSectionText(metabolismSubsection);
    if (cleaned.length > 10) pharmacology.metabolism = cleaned;
  }

  if (!pharmacology.halfLife && !pharmacology.bioavailability && !pharmacology.metabolism) {
    const fullSection = cleanSectionText(section);
    if (fullSection.length > 50) {
      pharmacology.metabolism = fullSection;
    }
  }

  const receptors: Array<{ name: string; action: string }> = [];
  const receptorPattern =
    /(\d+-HT\s*\d*[A-Z]?|[Dd]opamine|[Ss]erotonin|[Nn]orepinephrine|GABA[_-]?[AB]?|[Gg]lutamate|NMDA|[Oo]pioid|[Cc]annabinoid|[Aa]drenergic|[Mm]uscarinic|[Nn]icotinic|[Hh]istamine|[Ss]igma|[Aa]lpha-?\d?|[Bb]eta-?\d?)\s+(?:receptor)?\s*(agonist|antagonist|inhibitor|partial\s+agonist|inverse\s+agonist|modulator|reuptake\s+inhibitor)/gi;

  for (const match of section.matchAll(receptorPattern)) {
    receptors.push({
      name: match[1].trim(),
      action: match[2].trim().toLowerCase(),
    });
  }
  if (receptors.length > 0) pharmacology.receptors = receptors;

  return Object.keys(pharmacology).length > 1 ? pharmacology : undefined;
}
