import {
  addToNestedSet,
  buildSourceFieldRows,
  incrementNestedCount,
  incrementTextSize,
  renderTableSection,
  type NestedNumberMap,
  type NestedSetMap,
} from "../coverageReportHelpers";

import { NARRATIVE_TO_FIELD, SOURCE_NAMES } from "./config";
import { formatCell } from "./format";
import type { ParsedData } from "./loader";

const SOURCE_ORDER = Object.keys(SOURCE_NAMES);

export function generateChemistryBySource(data: ParsedData): string {
  const fields = ["formula", "smiles", "molecularWeight", "iupac", "cas", "inchiKey"];
  const counts: NestedNumberMap = {};

  for (const substance of Object.values(data.substances)) {
    if (!substance.chemistry?.sources) continue;
    for (const source of substance.chemistry.sources) {
      if (substance.chemistry.formula) incrementNestedCount(counts, source, "formula");
      if (substance.chemistry.smiles) incrementNestedCount(counts, source, "smiles");
      if (substance.chemistry.molecularWeight) incrementNestedCount(counts, source, "molecularWeight");
      if (substance.chemistry.iupac) incrementNestedCount(counts, source, "iupac");
      if (substance.chemistry.cas) incrementNestedCount(counts, source, "cas");
      if (substance.chemistry.inchiKey) incrementNestedCount(counts, source, "inchiKey");
    }
  }

  return renderTableSection(
    "### Chemistry Fields by Source",
    ["Source", ...fields],
    buildSourceFieldRows({
      counts,
      fields,
      formatValue: (value) => formatCell(value),
      sourceNames: SOURCE_NAMES,
      sourceOrder: SOURCE_ORDER,
    }),
  );
}

export function generatePharmacologyBySource(data: ParsedData): string {
  const fields = ["mechanismOfAction", "halfLife", "receptors", "metabolism", "bioavailability"];
  const counts: NestedNumberMap = {};

  for (const substance of Object.values(data.substances)) {
    if (!substance.pharmacology?.sources) continue;
    for (const source of substance.pharmacology.sources) {
      if (substance.pharmacology.mechanismOfAction?.length) {
        incrementNestedCount(counts, source, "mechanismOfAction");
      }
      if (substance.pharmacology.halfLife) incrementNestedCount(counts, source, "halfLife");
      if (substance.pharmacology.receptors?.length) incrementNestedCount(counts, source, "receptors");
      if (substance.pharmacology.metabolism) incrementNestedCount(counts, source, "metabolism");
      if (substance.pharmacology.bioavailability) incrementNestedCount(counts, source, "bioavailability");
    }
  }

  return renderTableSection(
    "### Pharmacology Fields by Source",
    ["Source", ...fields],
    buildSourceFieldRows({
      counts,
      fields,
      formatValue: (value) => formatCell(value),
      sourceNames: SOURCE_NAMES,
      sourceOrder: SOURCE_ORDER,
    }),
  );
}

export function generateHarmReductionBySource(data: ParsedData): string {
  const fields = ["rules", "shortTermRisks", "longTermRisks"];
  const counts: NestedNumberMap = {};

  for (const substance of Object.values(data.substances)) {
    if (!substance.harmReduction?.sources) continue;
    for (const source of substance.harmReduction.sources) {
      if (substance.harmReduction.rules?.length) incrementNestedCount(counts, source, "rules");
      if (substance.harmReduction.shortTermRisks?.length) incrementNestedCount(counts, source, "shortTermRisks");
      if (substance.harmReduction.longTermRisks?.length) incrementNestedCount(counts, source, "longTermRisks");
    }
  }

  return renderTableSection(
    "### Harm Reduction Fields by Source",
    ["Source", ...fields],
    buildSourceFieldRows({
      counts,
      fields,
      formatValue: (value) => formatCell(value),
      sourceNames: SOURCE_NAMES,
      sourceOrder: SOURCE_ORDER,
    }),
  );
}

export function generateCoreDataBySource(data: ParsedData): string {
  const counts: NestedSetMap = {};

  for (const [slug, substance] of Object.entries(data.substances)) {
    for (const item of substance.dosage || []) addToNestedSet(counts, item.source, "dosage", slug);
    for (const item of substance.duration || []) addToNestedSet(counts, item.source, "duration", slug);
    for (const item of substance.effects || []) addToNestedSet(counts, item.source, "effects", slug);
    for (const item of substance.interactions || []) addToNestedSet(counts, item.source, "interactions", slug);
    for (const item of substance.legal || []) addToNestedSet(counts, item.source, "legal", slug);
    for (const item of substance.tolerance || []) addToNestedSet(counts, item.source, "tolerance", slug);
  }

  const fields = ["dosage", "duration", "effects", "interactions", "legal", "tolerance"];
  return renderTableSection(
    "### Core Structured Data by Source",
    ["Source", ...fields],
    buildSourceFieldRows({
      counts,
      fields,
      formatValue: (value) => formatCell(value?.size),
      sourceNames: SOURCE_NAMES,
      sourceOrder: SOURCE_ORDER,
    }),
  );
}

export function generateNarrativeBySource(data: ParsedData): string {
  const counts: NestedSetMap = {};
  const charCounts: Record<string, number> = {};

  for (const [slug, substance] of Object.entries(data.substances)) {
    for (const note of substance.narrativeContent?.generalNotes || []) {
      const field = NARRATIVE_TO_FIELD[note.section] || note.section;
      addToNestedSet(counts, note.source, field, slug);
      incrementTextSize(charCounts, note.source, note.content);
    }
    for (const item of substance.narrativeContent?.experienceReports || []) {
      addToNestedSet(counts, item.source, "experience", slug);
      incrementTextSize(charCounts, item.source, item.content);
    }
    for (const item of substance.narrativeContent?.synthesis || []) {
      addToNestedSet(counts, item.source, "synthesis", slug);
      incrementTextSize(charCounts, item.source, item.content);
    }
    for (const item of substance.narrativeContent?.qualitativeComments || []) {
      addToNestedSet(counts, item.source, "commentary", slug);
      incrementTextSize(charCounts, item.source, item.content);
    }
  }

  const fields = ["overview", "history", "chemistry", "pharmacology", "effects", "harmReduction", "experience"];
  return renderTableSection(
    "### Narrative Content by Source",
    ["Source", "Size", ...fields],
    buildSourceFieldRows({
      counts,
      extraCells: (source) => [charCounts[source] ? `${(charCounts[source] / 1024).toFixed(0)}KB` : "-"],
      fields,
      formatValue: (value) => formatCell(value?.size),
      sourceNames: SOURCE_NAMES,
      sourceOrder: SOURCE_ORDER,
    }),
  );
}
