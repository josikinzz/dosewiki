/**
 * Generate Comprehensive Source Coverage Report
 *
 * Outputs markdown tables showing field coverage by source.
 * Run with: npx tsx scripts/data/generateCoverageReport.ts
 */

import * as fs from "fs";
import * as path from "path";
import {
  addToNestedSet,
  buildSourceFieldRows,
  incrementCount,
  incrementNestedCount,
  incrementTextSize,
  renderTableSection,
  type NestedNumberMap,
  type NestedSetMap,
} from "./coverageReportHelpers";

const TOTAL_SUBSTANCES = 679;

// Source display names
const SOURCE_NAMES: Record<string, string> = {
  "tripsit-factsheets": "TS-Facts",
  "tripsit-wiki": "TS-Wiki",
  "psychonautwiki": "PsychWiki",
  "drugbank": "DrugBank",
  "erowid": "Erowid",
  "isomerdesign": "Isomer",
  "saferparty": "SaferParty",
  "disregardeverythingisay": "DEIS",
  "drugusersbible": "DUB",
  "thedrugclassroom": "DrugClass",
  "wikipedia": "Wikipedia",
  "tripsit-combos": "TS-Combos",
};

// Map narrative sections to field categories
const NARRATIVE_TO_FIELD: Record<string, string> = {
  dosage: "dosage",
  dosage_context: "dosage",
  effects: "effects",
  effects_description: "effects",
  effects_overview: "effects",
  interactions: "interactions",
  chemistry: "chemistry",
  chemistry_pharmacology: "chemistry",
  pharmacology: "pharmacology",
  pharmacodynamics: "pharmacology",
  mechanism: "pharmacology",
  legal: "legal",
  harm_reduction: "harmReduction",
  harm_reduction_overview: "harmReduction",
  harm_reduction_guidance: "harmReduction",
  safety: "harmReduction",
  toxicity: "harmReduction",
  safer_use: "harmReduction",
  adulterants: "harmReduction",
  short_term_risks: "harmReduction",
  long_term_risks: "harmReduction",
  overview: "overview",
  summary: "overview",
  description: "overview",
  background: "overview",
  introduction: "overview",
  history: "history",
  forms: "forms",
  research: "research",
  production: "production",
  terminology: "terminology",
  uses: "uses",
  indication: "uses",
  adverse_effects: "adverse_effects",
  contraindications: "contraindications",
  overdose: "overdose",
  dependence: "dependence",
  addiction: "dependence",
  conclusion: "conclusion",
  trip_reports: "experience",
  after_effects: "after_effects",
  external_links: "external_links",
  extensions_and_commentary: "commentary",
  health_and_tolerance: "tolerance_narrative",
};

interface ParsedData {
  substances: Record<string, SubstanceData>;
}

interface SubstanceData {
  dosage: Array<{ route: string; source: string; ranges: Record<string, unknown> }>;
  duration: Array<{ route: string; source: string; stages: Record<string, unknown> }>;
  effects: Array<{ name: string; source: string }>;
  interactions: Array<{ substance: string; source: string; severity?: string; description?: string }>;
  legal: Array<{ country: string; status: string; source: string }>;
  tolerance: Array<{ source: string; rawText?: string }>;
  chemistry?: {
    sources: string[];
    formula?: string;
    smiles?: string;
    molecularWeight?: string;
    iupac?: string;
    cas?: string;
    inchiKey?: string;
  };
  pharmacology?: {
    sources: string[];
    halfLife?: string;
    metabolism?: string;
    receptors?: Array<{ name: string; action: string }>;
    mechanismOfAction?: string[];
    bioavailability?: string;
  };
  harmReduction?: {
    sources: string[];
    rules?: string[];
    shortTermRisks?: string[];
    longTermRisks?: string[];
    contraindications?: string[];
  };
  narrativeContent: {
    generalNotes: Array<{ source: string; section: string; content: string }>;
    experienceReports: Array<{ source: string; content: string }>;
    synthesis?: Array<{ source: string; content: string }>;
    qualitativeComments?: Array<{ source: string; content: string }>;
  };
}

function loadData(): ParsedData {
  const dataPath = path.join(process.cwd(), "src/data/parsed-sources.json");
  return JSON.parse(fs.readFileSync(dataPath, "utf-8"));
}

function formatCell(count: number | undefined, total = TOTAL_SUBSTANCES): string {
  if (!count || count === 0) return "-";
  const pct = ((count / total) * 100).toFixed(0);
  return `${count} (${pct}%)`;
}

function formatPct(count: number, total = TOTAL_SUBSTANCES): string {
  return `${count} (${((count / total) * 100).toFixed(1)}%)`;
}

// ============================================
// FIELD COVERAGE SUMMARY
// ============================================

function generateFieldCoverageSummary(data: ParsedData): string {
  const stats: Record<string, number> = {};

  for (const sub of Object.values(data.substances)) {
    // Chemistry
    if (sub.chemistry?.formula) incrementCount(stats, "chemistry.formula");
    if (sub.chemistry?.smiles) incrementCount(stats, "chemistry.smiles");
    if (sub.chemistry?.molecularWeight) incrementCount(stats, "chemistry.molecularWeight");
    if (sub.chemistry?.iupac) incrementCount(stats, "chemistry.iupac");
    if (sub.chemistry?.cas) incrementCount(stats, "chemistry.cas");
    if (sub.chemistry?.inchiKey) incrementCount(stats, "chemistry.inchiKey");

    // Pharmacology
    if (sub.pharmacology?.halfLife) incrementCount(stats, "pharmacology.halfLife");
    if (sub.pharmacology?.metabolism) incrementCount(stats, "pharmacology.metabolism");
    if (sub.pharmacology?.receptors?.length) incrementCount(stats, "pharmacology.receptors");
    if (sub.pharmacology?.mechanismOfAction?.length) incrementCount(stats, "pharmacology.mechanismOfAction");
    if (sub.pharmacology?.bioavailability) incrementCount(stats, "pharmacology.bioavailability");

    // Harm Reduction
    if (sub.harmReduction?.rules?.length) incrementCount(stats, "harmReduction.rules");
    if (sub.harmReduction?.shortTermRisks?.length) incrementCount(stats, "harmReduction.shortTermRisks");
    if (sub.harmReduction?.longTermRisks?.length) incrementCount(stats, "harmReduction.longTermRisks");
    if (sub.harmReduction?.contraindications?.length) incrementCount(stats, "harmReduction.contraindications");

    // Core structured
    if (sub.dosage?.length) incrementCount(stats, "dosage");
    if (sub.duration?.length) incrementCount(stats, "duration");
    if (sub.effects?.length) incrementCount(stats, "effects");
    if (sub.interactions?.length) incrementCount(stats, "interactions");
    if (sub.legal?.length) incrementCount(stats, "legal");
    if (sub.tolerance?.length) incrementCount(stats, "tolerance");
    if (sub.tolerance?.some((t) => t.rawText?.length)) incrementCount(stats, "toleranceWithText");

    // Narrative
    if (sub.narrativeContent?.generalNotes?.length) incrementCount(stats, "narrative.generalNotes");
    if (sub.narrativeContent?.experienceReports?.length) incrementCount(stats, "narrative.experienceReports");
    if (sub.narrativeContent?.synthesis?.length) incrementCount(stats, "narrative.synthesis");
    if (sub.narrativeContent?.qualitativeComments?.length) incrementCount(stats, "narrative.qualitativeComments");
  }

  let output = "## Field Coverage Summary\n\n";
  output += `Total substances: ${TOTAL_SUBSTANCES}\n\n`;

  const summarySections = [
    {
      title: "### Core Structured Data",
      fields: [
        "dosage",
        "duration",
        "effects",
        "interactions",
        "legal",
        "tolerance",
        "toleranceWithText",
      ],
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

  for (const section of summarySections) {
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

// ============================================
// CHEMISTRY FIELDS BY SOURCE
// ============================================

function generateChemistryBySource(data: ParsedData): string {
  const fields = ["formula", "smiles", "molecularWeight", "iupac", "cas", "inchiKey"];
  const sources = Object.keys(SOURCE_NAMES);
  const counts: NestedNumberMap = {};

  for (const sub of Object.values(data.substances)) {
    if (!sub.chemistry?.sources) continue;
    for (const src of sub.chemistry.sources) {
      if (sub.chemistry.formula) incrementNestedCount(counts, src, "formula");
      if (sub.chemistry.smiles) incrementNestedCount(counts, src, "smiles");
      if (sub.chemistry.molecularWeight) incrementNestedCount(counts, src, "molecularWeight");
      if (sub.chemistry.iupac) incrementNestedCount(counts, src, "iupac");
      if (sub.chemistry.cas) incrementNestedCount(counts, src, "cas");
      if (sub.chemistry.inchiKey) incrementNestedCount(counts, src, "inchiKey");
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
      sourceOrder: sources,
    }),
  );
}

// ============================================
// PHARMACOLOGY FIELDS BY SOURCE
// ============================================

function generatePharmacologyBySource(data: ParsedData): string {
  const fields = ["mechanismOfAction", "halfLife", "receptors", "metabolism", "bioavailability"];
  const sources = Object.keys(SOURCE_NAMES);
  const counts: NestedNumberMap = {};

  for (const sub of Object.values(data.substances)) {
    if (!sub.pharmacology?.sources) continue;
    for (const src of sub.pharmacology.sources) {
      if (sub.pharmacology.mechanismOfAction?.length) incrementNestedCount(counts, src, "mechanismOfAction");
      if (sub.pharmacology.halfLife) incrementNestedCount(counts, src, "halfLife");
      if (sub.pharmacology.receptors?.length) incrementNestedCount(counts, src, "receptors");
      if (sub.pharmacology.metabolism) incrementNestedCount(counts, src, "metabolism");
      if (sub.pharmacology.bioavailability) incrementNestedCount(counts, src, "bioavailability");
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
      sourceOrder: sources,
    }),
  );
}

// ============================================
// HARM REDUCTION BY SOURCE
// ============================================

function generateHarmReductionBySource(data: ParsedData): string {
  const fields = ["rules", "shortTermRisks", "longTermRisks"];
  const sources = Object.keys(SOURCE_NAMES);
  const counts: NestedNumberMap = {};

  for (const sub of Object.values(data.substances)) {
    if (!sub.harmReduction?.sources) continue;
    for (const src of sub.harmReduction.sources) {
      if (sub.harmReduction.rules?.length) incrementNestedCount(counts, src, "rules");
      if (sub.harmReduction.shortTermRisks?.length) incrementNestedCount(counts, src, "shortTermRisks");
      if (sub.harmReduction.longTermRisks?.length) incrementNestedCount(counts, src, "longTermRisks");
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
      sourceOrder: sources,
    }),
  );
}

// ============================================
// CORE DATA BY SOURCE (Structured)
// ============================================

function generateCoreDataBySource(data: ParsedData): string {
  const sources = Object.keys(SOURCE_NAMES);
  const counts: NestedSetMap = {};

  for (const [slug, sub] of Object.entries(data.substances)) {
    // Dosage
    for (const item of sub.dosage || []) {
      addToNestedSet(counts, item.source, "dosage", slug);
    }

    // Duration
    for (const item of sub.duration || []) {
      addToNestedSet(counts, item.source, "duration", slug);
    }

    // Effects
    for (const item of sub.effects || []) {
      addToNestedSet(counts, item.source, "effects", slug);
    }

    // Interactions
    for (const item of sub.interactions || []) {
      addToNestedSet(counts, item.source, "interactions", slug);
    }

    // Legal
    for (const item of sub.legal || []) {
      addToNestedSet(counts, item.source, "legal", slug);
    }

    // Tolerance
    for (const item of sub.tolerance || []) {
      addToNestedSet(counts, item.source, "tolerance", slug);
    }
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
      sourceOrder: sources,
    }),
  );
}

// ============================================
// NARRATIVE BY SOURCE
// ============================================

function generateNarrativeBySource(data: ParsedData): string {
  const counts: NestedSetMap = {};
  const charCounts: Record<string, number> = {};

  for (const [slug, sub] of Object.entries(data.substances)) {
    for (const note of sub.narrativeContent?.generalNotes || []) {
      const field = NARRATIVE_TO_FIELD[note.section] || note.section;
      addToNestedSet(counts, note.source, field, slug);
      incrementTextSize(charCounts, note.source, note.content);
    }

    for (const exp of sub.narrativeContent?.experienceReports || []) {
      addToNestedSet(counts, exp.source, "experience", slug);
      incrementTextSize(charCounts, exp.source, exp.content);
    }

    for (const syn of sub.narrativeContent?.synthesis || []) {
      addToNestedSet(counts, syn.source, "synthesis", slug);
      incrementTextSize(charCounts, syn.source, syn.content);
    }

    for (const qc of sub.narrativeContent?.qualitativeComments || []) {
      addToNestedSet(counts, qc.source, "commentary", slug);
      incrementTextSize(charCounts, qc.source, qc.content);
    }
  }

  // Key narrative fields
  const fields = ["overview", "history", "chemistry", "pharmacology", "effects", "harmReduction", "experience"];

  const sources = Object.keys(SOURCE_NAMES);
  return renderTableSection(
    "### Narrative Content by Source",
    ["Source", "Size", ...fields],
    buildSourceFieldRows({
      counts,
      extraCells: (source) => [charCounts[source] ? `${(charCounts[source] / 1024).toFixed(0)}KB` : "-"],
      fields,
      formatValue: (value) => formatCell(value?.size),
      sourceNames: SOURCE_NAMES,
      sourceOrder: sources,
    }),
  );
}

// ============================================
// NARRATIVE SECTIONS DETAIL
// ============================================

function generateNarrativeSectionsDetail(data: ParsedData): string {
  const sectionsBySource: NestedNumberMap = {};

  for (const sub of Object.values(data.substances)) {
    for (const note of sub.narrativeContent?.generalNotes || []) {
      const field = NARRATIVE_TO_FIELD[note.section] || note.section;
      incrementNestedCount(sectionsBySource, note.source, field);
    }

    for (const exp of sub.narrativeContent?.experienceReports || []) {
      incrementNestedCount(sectionsBySource, exp.source, "experience");
    }

    for (const syn of sub.narrativeContent?.synthesis || []) {
      incrementNestedCount(sectionsBySource, syn.source, "synthesis");
    }

    for (const qc of sub.narrativeContent?.qualitativeComments || []) {
      incrementNestedCount(sectionsBySource, qc.source, "commentary");
    }
  }

  let output = "### Narrative Sections Detail\n\n";

  const sources = Object.keys(SOURCE_NAMES);
  for (const source of sources) {
    const sections = sectionsBySource[source];
    if (!sections) continue;

    const displayName = SOURCE_NAMES[source];
    const sorted = Object.entries(sections).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, [, count]) => sum + count, 0);

    output += `**${displayName}** (${sorted.length} section types, ${total} total):\n`;
    output += `- ${sorted.map(([s, c]) => `${s} (${c})`).join(", ")}\n\n`;
  }

  return output;
}

// ============================================
// STRUCTURED VS NARRATIVE OVERLAP
// ============================================

function generateOverlapAnalysis(data: ParsedData): string {
  const fields = ["chemistry", "pharmacology", "effects", "harmReduction", "dosage", "interactions"];
  const rows: Array<Array<string | number>> = [];

  for (const field of fields) {
    let both = 0;
    let narrOnly = 0;
    let structOnly = 0;

    for (const sub of Object.values(data.substances)) {
      // Check structured
      let hasStruct = false;
      if (field === "chemistry") {
        hasStruct = !!sub.chemistry && Object.keys(sub.chemistry).length > 1;
      } else if (field === "pharmacology") {
        hasStruct = !!sub.pharmacology && Object.keys(sub.pharmacology).length > 1;
      } else if (field === "effects") {
        hasStruct = (sub.effects?.length || 0) > 0;
      } else if (field === "harmReduction") {
        hasStruct = !!sub.harmReduction && Object.keys(sub.harmReduction).length > 1;
      } else if (field === "dosage") {
        hasStruct = (sub.dosage?.length || 0) > 0;
      } else if (field === "interactions") {
        hasStruct = (sub.interactions?.length || 0) > 0;
      }

      // Check narrative
      const narrSections = field === "harmReduction"
        ? ["harmReduction", "safety", "toxicity", "safer_use"]
        : [field];

      const hasNarr = sub.narrativeContent?.generalNotes?.some(n =>
        narrSections.includes(n.section) || narrSections.includes(NARRATIVE_TO_FIELD[n.section])
      );

      if (hasStruct && hasNarr) both++;
      else if (hasNarr) narrOnly++;
      else if (hasStruct) structOnly++;
    }

    const total = both + narrOnly + structOnly;
    rows.push([field, both, narrOnly, structOnly, formatPct(total)]);
  }

  return renderTableSection(
    "### Structured vs Narrative Overlap",
    ["Field", "Both", "Narrative Only", "Structured Only", "Total Coverage"],
    rows,
  );
}

// ============================================
// MAIN
// ============================================

function main() {
  const data = loadData();

  console.log(generateFieldCoverageSummary(data));
  console.log("\n---\n");
  console.log("## Coverage by Source\n");
  console.log(generateCoreDataBySource(data));
  console.log(generateChemistryBySource(data));
  console.log(generatePharmacologyBySource(data));
  console.log(generateHarmReductionBySource(data));
  console.log(generateNarrativeBySource(data));
  console.log("\n---\n");
  console.log(generateOverlapAnalysis(data));
  console.log("\n---\n");
  console.log(generateNarrativeSectionsDetail(data));
}

main();
