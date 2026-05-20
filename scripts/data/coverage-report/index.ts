import { generateOverlapAnalysis, generateNarrativeSectionsDetail } from "./analysis";
import { generateChemistryBySource, generateCoreDataBySource, generateHarmReductionBySource, generateNarrativeBySource, generatePharmacologyBySource } from "./bySource";
import type { ParsedData } from "./loader";
import { generateFieldCoverageSummary } from "./summary";

export function generateCoverageReport(data: ParsedData): string {
  return [
    generateFieldCoverageSummary(data),
    "---",
    "## Coverage by Source",
    generateCoreDataBySource(data),
    generateChemistryBySource(data),
    generatePharmacologyBySource(data),
    generateHarmReductionBySource(data),
    generateNarrativeBySource(data),
    "---",
    generateOverlapAnalysis(data),
    "---",
    generateNarrativeSectionsDetail(data).trimEnd(),
  ].join("\n\n");
}
