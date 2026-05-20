import { describe, expect, it } from "vitest";

import { generateCoverageReport } from "../scripts/data/coverage-report";
import type { ParsedData } from "../scripts/data/coverage-report/loader";

describe("generateCoverageReport", () => {
  it("assembles section summaries and source tables from fixture data", () => {
    const data: ParsedData = {
      substances: {
        fixtureamine: {
          dosage: [{ route: "Oral", source: "psychonautwiki", ranges: { common: { min: 10, max: 20, unit: "mg" } } }],
          duration: [{ route: "Oral", source: "psychonautwiki", stages: { total: { min: 4, max: 6, unit: "hours" } } }],
          effects: [{ name: "Euphoria", source: "psychonautwiki" }],
          interactions: [{ substance: "Tramadol", source: "drugbank" }],
          legal: [{ country: "United States", status: "Schedule I", source: "psychonautwiki" }],
          tolerance: [{ source: "tripsit-wiki", rawText: "Tolerance text" }],
          chemistry: { sources: ["drugbank"], formula: "C10H10", smiles: "CC", molecularWeight: "100" },
          pharmacology: { sources: ["drugbank"], halfLife: "4 hours", mechanismOfAction: ["serotonin agonist"] },
          harmReduction: { sources: ["tripsit-wiki"], rules: ["Start low"], shortTermRisks: ["Anxiety"] },
          narrativeContent: {
            generalNotes: [
              { source: "psychonautwiki", section: "introduction", content: "Intro text" },
              { source: "drugbank", section: "pharmacology", content: "Pharmacology note" },
            ],
            experienceReports: [{ source: "erowid", content: "Experience report" }],
          },
        },
      },
    };

    const report = generateCoverageReport(data);

    expect(report).toContain("## Field Coverage Summary");
    expect(report).toContain("### Core Structured Data");
    expect(report).toContain("## Coverage by Source");
    expect(report).toContain("### Core Structured Data by Source");
    expect(report).toContain("**PsychWiki**");
    expect(report).toContain("### Structured vs Narrative Overlap");
    expect(report).toContain("### Narrative Sections Detail");
    expect(report).toContain("**DrugBank**");
  });
});
