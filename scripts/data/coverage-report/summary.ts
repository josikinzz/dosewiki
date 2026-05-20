import { incrementCount, renderTableSection } from "../coverageReportHelpers";

import { TOTAL_SUBSTANCES } from "./config";
import { formatPct } from "./format";
import type { ParsedData } from "./loader";

export function generateFieldCoverageSummary(data: ParsedData): string {
  const stats: Record<string, number> = {};

  for (const substance of Object.values(data.substances)) {
    if (substance.chemistry?.formula) incrementCount(stats, "chemistry.formula");
    if (substance.chemistry?.smiles) incrementCount(stats, "chemistry.smiles");
    if (substance.chemistry?.molecularWeight) incrementCount(stats, "chemistry.molecularWeight");
    if (substance.chemistry?.iupac) incrementCount(stats, "chemistry.iupac");
    if (substance.chemistry?.cas) incrementCount(stats, "chemistry.cas");
    if (substance.chemistry?.inchiKey) incrementCount(stats, "chemistry.inchiKey");

    if (substance.pharmacology?.halfLife) incrementCount(stats, "pharmacology.halfLife");
    if (substance.pharmacology?.metabolism) incrementCount(stats, "pharmacology.metabolism");
    if (substance.pharmacology?.receptors?.length) incrementCount(stats, "pharmacology.receptors");
    if (substance.pharmacology?.mechanismOfAction?.length) incrementCount(stats, "pharmacology.mechanismOfAction");
    if (substance.pharmacology?.bioavailability) incrementCount(stats, "pharmacology.bioavailability");

    if (substance.harmReduction?.rules?.length) incrementCount(stats, "harmReduction.rules");
    if (substance.harmReduction?.shortTermRisks?.length) incrementCount(stats, "harmReduction.shortTermRisks");
    if (substance.harmReduction?.longTermRisks?.length) incrementCount(stats, "harmReduction.longTermRisks");
    if (substance.harmReduction?.contraindications?.length) incrementCount(
      stats,
      "harmReduction.contraindications",
    );

    if (substance.dosage?.length) incrementCount(stats, "dosage");
    if (substance.duration?.length) incrementCount(stats, "duration");
    if (substance.effects?.length) incrementCount(stats, "effects");
    if (substance.interactions?.length) incrementCount(stats, "interactions");
    if (substance.legal?.length) incrementCount(stats, "legal");
    if (substance.tolerance?.length) incrementCount(stats, "tolerance");
    if (substance.tolerance?.some((item) => item.rawText?.length)) incrementCount(stats, "toleranceWithText");

    if (substance.narrativeContent?.generalNotes?.length) incrementCount(stats, "narrative.generalNotes");
    if (substance.narrativeContent?.experienceReports?.length) {
      incrementCount(stats, "narrative.experienceReports");
    }
    if (substance.narrativeContent?.synthesis?.length) incrementCount(stats, "narrative.synthesis");
    if (substance.narrativeContent?.qualitativeComments?.length) {
      incrementCount(stats, "narrative.qualitativeComments");
    }
  }

  let output = "## Field Coverage Summary\n\n";
  output += `Total substances: ${TOTAL_SUBSTANCES}\n\n`;

  const sections = [
    {
      title: "### Core Structured Data",
      fields: ["dosage", "duration", "effects", "interactions", "legal", "tolerance", "toleranceWithText"],
      labels: {
        dosage: "dosage",
        duration: "duration",
        effects: "effects",
        interactions: "interactions",
        legal: "legal",
        tolerance: "tolerance",
        toleranceWithText: "toleranceWithText",
      },
    },
    {
      title: "### Chemistry Fields",
      fields: ["chemistry.formula", "chemistry.smiles", "chemistry.molecularWeight", "chemistry.iupac", "chemistry.cas", "chemistry.inchiKey"],
      labels: {
        "chemistry.formula": "formula",
        "chemistry.smiles": "smiles",
        "chemistry.molecularWeight": "molecularWeight",
        "chemistry.iupac": "iupac",
        "chemistry.cas": "cas",
        "chemistry.inchiKey": "inchiKey",
      },
    },
    {
      title: "### Pharmacology Fields",
      fields: [
        "pharmacology.mechanismOfAction",
        "pharmacology.halfLife",
        "pharmacology.receptors",
        "pharmacology.metabolism",
        "pharmacology.bioavailability",
      ],
      labels: {
        "pharmacology.mechanismOfAction": "mechanismOfAction",
        "pharmacology.halfLife": "halfLife",
        "pharmacology.receptors": "receptors",
        "pharmacology.metabolism": "metabolism",
        "pharmacology.bioavailability": "bioavailability",
      },
    },
    {
      title: "### Harm Reduction Fields",
      fields: [
        "harmReduction.rules",
        "harmReduction.shortTermRisks",
        "harmReduction.longTermRisks",
        "harmReduction.contraindications",
      ],
      labels: {
        "harmReduction.rules": "rules",
        "harmReduction.shortTermRisks": "shortTermRisks",
        "harmReduction.longTermRisks": "longTermRisks",
        "harmReduction.contraindications": "contraindications",
      },
    },
    {
      title: "### Narrative Content",
      fields: [
        "narrative.generalNotes",
        "narrative.experienceReports",
        "narrative.synthesis",
        "narrative.qualitativeComments",
      ],
      labels: {
        "narrative.generalNotes": "generalNotes",
        "narrative.experienceReports": "experienceReports",
        "narrative.synthesis": "synthesis",
        "narrative.qualitativeComments": "qualitativeComments",
      },
    },
  ];

  for (const section of sections) {
    output += renderTableSection(
      section.title,
      ["Field", "Count", "Coverage"],
      section.fields.map((field) => [
        section.labels[field as keyof typeof section.labels],
        stats[field] || 0,
        formatPct(stats[field] || 0),
      ]),
    );
    output += "\n";
  }

  return output.trimEnd();
}
