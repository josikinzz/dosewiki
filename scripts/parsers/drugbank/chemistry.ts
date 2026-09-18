import type { ParsedChemistry } from "../types";

import { extractSection } from "../base";

export function parseChemicalInformation(
  content: string,
  sourceId: string,
): Partial<ParsedChemistry> {
  let section = extractSection(content, "Chemical Information", 2);
  if (!section) return { sources: [sourceId] };

  let previous = "";
  while (previous !== section) {
    previous = section;
    section = section.replace(/([A-Z])\n(\d+)/g, "$1$2");
    section = section.replace(/([a-z])\n(\d+)/g, "$1$2");
  }

  const chemistry: Partial<ParsedChemistry> = { sources: [sourceId] };
  const formulaMatch = section.match(/\*\*Chemical Formula:\*\*\s*([A-Za-z0-9\n]+?)(?=\n\n|\n\*\*|$)/);
  if (formulaMatch) {
    const formula = formulaMatch[1].replace(/\n/g, "").replace(/\s+/g, "");
    if (formula.length >= 2) chemistry.formula = formula;
  }

  for (const { pattern, field } of [
    { pattern: /\*\*SMILES:\*\*\s*([^\n]+)/i, field: "smiles" },
    { pattern: /\*\*Weight:\*\*\s*([^\n]+)/i, field: "molecularWeight" },
  ] as const) {
    const match = section.match(pattern);
    if (match) {
      chemistry[field] = match[1].trim().replace(/\s+/g, "");
    }
  }

  const iupacMatch = section.match(/\*\*IUPAC Name:\*\*\s*(.+?)(?=\n\*\*|\n\n|$)/is);
  if (iupacMatch) {
    const iupac = iupacMatch[1].replace(/\n/g, " ").trim();
    if (iupac.length >= 5 && !iupac.includes("blocker") && !iupac.includes("agonist")) {
      chemistry.iupac = iupac;
    }
  }

  const casSection = extractSection(content, "CAS number", 3);
  if (casSection) {
    const casValue = casSection.split("\n")[0].trim();
    if (/^\d{2,7}-\d{2}-\d$/.test(casValue)) chemistry.cas = casValue;
  }

  const inchiMatch = section.match(/\*\*InChI:\*\*\s*(.+?)(?=\n\*\*|\n\n|$)/is);
  if (inchiMatch) chemistry.inchi = inchiMatch[1].replace(/\n/g, "").trim();

  const inchiKeySection = extractSection(content, "InChI Key", 3);
  if (inchiKeySection) {
    const value = inchiKeySection.split("\n")[0].trim();
    if (value.length > 10) chemistry.inchiKey = value;
  }

  return chemistry;
}
