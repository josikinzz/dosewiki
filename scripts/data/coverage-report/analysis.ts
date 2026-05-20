import { incrementNestedCount, renderTableSection, type NestedNumberMap } from "../coverageReportHelpers";

import { NARRATIVE_TO_FIELD, SOURCE_NAMES } from "./config";
import { formatPct } from "./format";
import type { ParsedData } from "./loader";

export function generateNarrativeSectionsDetail(data: ParsedData): string {
  const sectionsBySource: NestedNumberMap = {};

  for (const substance of Object.values(data.substances)) {
    for (const note of substance.narrativeContent?.generalNotes || []) {
      incrementNestedCount(sectionsBySource, note.source, NARRATIVE_TO_FIELD[note.section] || note.section);
    }
    for (const item of substance.narrativeContent?.experienceReports || []) {
      incrementNestedCount(sectionsBySource, item.source, "experience");
    }
    for (const item of substance.narrativeContent?.synthesis || []) {
      incrementNestedCount(sectionsBySource, item.source, "synthesis");
    }
    for (const item of substance.narrativeContent?.qualitativeComments || []) {
      incrementNestedCount(sectionsBySource, item.source, "commentary");
    }
  }

  let output = "### Narrative Sections Detail\n\n";
  for (const source of Object.keys(SOURCE_NAMES)) {
    const sections = sectionsBySource[source];
    if (!sections) continue;

    const sorted = Object.entries(sections).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, [, count]) => sum + count, 0);
    output += `**${SOURCE_NAMES[source]}** (${sorted.length} section types, ${total} total):\n`;
    output += `- ${sorted.map(([section, count]) => `${section} (${count})`).join(", ")}\n\n`;
  }

  return output;
}

export function generateOverlapAnalysis(data: ParsedData): string {
  const rows: Array<Array<string | number>> = [];
  for (const field of ["chemistry", "pharmacology", "effects", "harmReduction", "dosage", "interactions"]) {
    let both = 0;
    let narrativeOnly = 0;
    let structuredOnly = 0;

    for (const substance of Object.values(data.substances)) {
      let hasStructured = false;
      if (field === "chemistry") hasStructured = !!substance.chemistry && Object.keys(substance.chemistry).length > 1;
      else if (field === "pharmacology") {
        hasStructured = !!substance.pharmacology && Object.keys(substance.pharmacology).length > 1;
      } else if (field === "effects") hasStructured = (substance.effects?.length || 0) > 0;
      else if (field === "harmReduction") {
        hasStructured = !!substance.harmReduction && Object.keys(substance.harmReduction).length > 1;
      } else if (field === "dosage") hasStructured = (substance.dosage?.length || 0) > 0;
      else if (field === "interactions") hasStructured = (substance.interactions?.length || 0) > 0;

      const narrativeSections =
        field === "harmReduction" ? ["harmReduction", "safety", "toxicity", "safer_use"] : [field];
      const hasNarrative = substance.narrativeContent?.generalNotes?.some(
        (note) =>
          narrativeSections.includes(note.section) ||
          narrativeSections.includes(NARRATIVE_TO_FIELD[note.section]),
      );

      if (hasStructured && hasNarrative) both++;
      else if (hasNarrative) narrativeOnly++;
      else if (hasStructured) structuredOnly++;
    }

    rows.push([field, both, narrativeOnly, structuredOnly, formatPct(both + narrativeOnly + structuredOnly)]);
  }

  return renderTableSection(
    "### Structured vs Narrative Overlap",
    ["Field", "Both", "Narrative Only", "Structured Only", "Total Coverage"],
    rows,
  );
}
