/**
 * Generate Comprehensive Source Coverage Report
 *
 * Outputs markdown tables showing field coverage by source.
 * Run with: npx tsx scripts/data/generateCoverageReport.ts
 */

import * as fs from "fs";
import * as path from "path";

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
    if (sub.chemistry?.formula) stats["chemistry.formula"] = (stats["chemistry.formula"] || 0) + 1;
    if (sub.chemistry?.smiles) stats["chemistry.smiles"] = (stats["chemistry.smiles"] || 0) + 1;
    if (sub.chemistry?.molecularWeight) stats["chemistry.molecularWeight"] = (stats["chemistry.molecularWeight"] || 0) + 1;
    if (sub.chemistry?.iupac) stats["chemistry.iupac"] = (stats["chemistry.iupac"] || 0) + 1;
    if (sub.chemistry?.cas) stats["chemistry.cas"] = (stats["chemistry.cas"] || 0) + 1;
    if (sub.chemistry?.inchiKey) stats["chemistry.inchiKey"] = (stats["chemistry.inchiKey"] || 0) + 1;

    // Pharmacology
    if (sub.pharmacology?.halfLife) stats["pharmacology.halfLife"] = (stats["pharmacology.halfLife"] || 0) + 1;
    if (sub.pharmacology?.metabolism) stats["pharmacology.metabolism"] = (stats["pharmacology.metabolism"] || 0) + 1;
    if (sub.pharmacology?.receptors?.length) stats["pharmacology.receptors"] = (stats["pharmacology.receptors"] || 0) + 1;
    if (sub.pharmacology?.mechanismOfAction?.length) stats["pharmacology.mechanismOfAction"] = (stats["pharmacology.mechanismOfAction"] || 0) + 1;
    if (sub.pharmacology?.bioavailability) stats["pharmacology.bioavailability"] = (stats["pharmacology.bioavailability"] || 0) + 1;

    // Harm Reduction
    if (sub.harmReduction?.rules?.length) stats["harmReduction.rules"] = (stats["harmReduction.rules"] || 0) + 1;
    if (sub.harmReduction?.shortTermRisks?.length) stats["harmReduction.shortTermRisks"] = (stats["harmReduction.shortTermRisks"] || 0) + 1;
    if (sub.harmReduction?.longTermRisks?.length) stats["harmReduction.longTermRisks"] = (stats["harmReduction.longTermRisks"] || 0) + 1;
    if (sub.harmReduction?.contraindications?.length) stats["harmReduction.contraindications"] = (stats["harmReduction.contraindications"] || 0) + 1;

    // Core structured
    if (sub.dosage?.length) stats["dosage"] = (stats["dosage"] || 0) + 1;
    if (sub.duration?.length) stats["duration"] = (stats["duration"] || 0) + 1;
    if (sub.effects?.length) stats["effects"] = (stats["effects"] || 0) + 1;
    if (sub.interactions?.length) stats["interactions"] = (stats["interactions"] || 0) + 1;
    if (sub.legal?.length) stats["legal"] = (stats["legal"] || 0) + 1;
    if (sub.tolerance?.length) stats["tolerance"] = (stats["tolerance"] || 0) + 1;
    if (sub.tolerance?.some(t => t.rawText?.length)) stats["toleranceWithText"] = (stats["toleranceWithText"] || 0) + 1;

    // Narrative
    if (sub.narrativeContent?.generalNotes?.length) stats["narrative.generalNotes"] = (stats["narrative.generalNotes"] || 0) + 1;
    if (sub.narrativeContent?.experienceReports?.length) stats["narrative.experienceReports"] = (stats["narrative.experienceReports"] || 0) + 1;
    if (sub.narrativeContent?.synthesis?.length) stats["narrative.synthesis"] = (stats["narrative.synthesis"] || 0) + 1;
    if (sub.narrativeContent?.qualitativeComments?.length) stats["narrative.qualitativeComments"] = (stats["narrative.qualitativeComments"] || 0) + 1;
  }

  let output = "## Field Coverage Summary\n\n";
  output += `Total substances: ${TOTAL_SUBSTANCES}\n\n`;

  // Core Data
  output += "### Core Structured Data\n\n";
  output += "| Field | Count | Coverage |\n";
  output += "|-------|-------|----------|\n";
  output += `| dosage | ${stats["dosage"] || 0} | ${formatPct(stats["dosage"] || 0)} |\n`;
  output += `| duration | ${stats["duration"] || 0} | ${formatPct(stats["duration"] || 0)} |\n`;
  output += `| effects | ${stats["effects"] || 0} | ${formatPct(stats["effects"] || 0)} |\n`;
  output += `| interactions | ${stats["interactions"] || 0} | ${formatPct(stats["interactions"] || 0)} |\n`;
  output += `| legal | ${stats["legal"] || 0} | ${formatPct(stats["legal"] || 0)} |\n`;
  output += `| tolerance | ${stats["tolerance"] || 0} | ${formatPct(stats["tolerance"] || 0)} |\n`;
  output += `| toleranceWithText | ${stats["toleranceWithText"] || 0} | ${formatPct(stats["toleranceWithText"] || 0)} |\n`;

  // Chemistry
  output += "\n### Chemistry Fields\n\n";
  output += "| Field | Count | Coverage |\n";
  output += "|-------|-------|----------|\n";
  output += `| formula | ${stats["chemistry.formula"] || 0} | ${formatPct(stats["chemistry.formula"] || 0)} |\n`;
  output += `| smiles | ${stats["chemistry.smiles"] || 0} | ${formatPct(stats["chemistry.smiles"] || 0)} |\n`;
  output += `| molecularWeight | ${stats["chemistry.molecularWeight"] || 0} | ${formatPct(stats["chemistry.molecularWeight"] || 0)} |\n`;
  output += `| iupac | ${stats["chemistry.iupac"] || 0} | ${formatPct(stats["chemistry.iupac"] || 0)} |\n`;
  output += `| cas | ${stats["chemistry.cas"] || 0} | ${formatPct(stats["chemistry.cas"] || 0)} |\n`;
  output += `| inchiKey | ${stats["chemistry.inchiKey"] || 0} | ${formatPct(stats["chemistry.inchiKey"] || 0)} |\n`;

  // Pharmacology
  output += "\n### Pharmacology Fields\n\n";
  output += "| Field | Count | Coverage |\n";
  output += "|-------|-------|----------|\n";
  output += `| mechanismOfAction | ${stats["pharmacology.mechanismOfAction"] || 0} | ${formatPct(stats["pharmacology.mechanismOfAction"] || 0)} |\n`;
  output += `| halfLife | ${stats["pharmacology.halfLife"] || 0} | ${formatPct(stats["pharmacology.halfLife"] || 0)} |\n`;
  output += `| receptors | ${stats["pharmacology.receptors"] || 0} | ${formatPct(stats["pharmacology.receptors"] || 0)} |\n`;
  output += `| metabolism | ${stats["pharmacology.metabolism"] || 0} | ${formatPct(stats["pharmacology.metabolism"] || 0)} |\n`;
  output += `| bioavailability | ${stats["pharmacology.bioavailability"] || 0} | ${formatPct(stats["pharmacology.bioavailability"] || 0)} |\n`;

  // Harm Reduction
  output += "\n### Harm Reduction Fields\n\n";
  output += "| Field | Count | Coverage |\n";
  output += "|-------|-------|----------|\n";
  output += `| rules | ${stats["harmReduction.rules"] || 0} | ${formatPct(stats["harmReduction.rules"] || 0)} |\n`;
  output += `| shortTermRisks | ${stats["harmReduction.shortTermRisks"] || 0} | ${formatPct(stats["harmReduction.shortTermRisks"] || 0)} |\n`;
  output += `| longTermRisks | ${stats["harmReduction.longTermRisks"] || 0} | ${formatPct(stats["harmReduction.longTermRisks"] || 0)} |\n`;
  output += `| contraindications | ${stats["harmReduction.contraindications"] || 0} | ${formatPct(stats["harmReduction.contraindications"] || 0)} |\n`;

  // Narrative
  output += "\n### Narrative Content\n\n";
  output += "| Field | Count | Coverage |\n";
  output += "|-------|-------|----------|\n";
  output += `| generalNotes | ${stats["narrative.generalNotes"] || 0} | ${formatPct(stats["narrative.generalNotes"] || 0)} |\n`;
  output += `| experienceReports | ${stats["narrative.experienceReports"] || 0} | ${formatPct(stats["narrative.experienceReports"] || 0)} |\n`;
  output += `| synthesis | ${stats["narrative.synthesis"] || 0} | ${formatPct(stats["narrative.synthesis"] || 0)} |\n`;
  output += `| qualitativeComments | ${stats["narrative.qualitativeComments"] || 0} | ${formatPct(stats["narrative.qualitativeComments"] || 0)} |\n`;

  return output;
}

// ============================================
// CHEMISTRY FIELDS BY SOURCE
// ============================================

function generateChemistryBySource(data: ParsedData): string {
  const fields = ["formula", "smiles", "molecularWeight", "iupac", "cas", "inchiKey"];
  const sources = Object.keys(SOURCE_NAMES);
  const counts: Record<string, Record<string, number>> = {};

  for (const sub of Object.values(data.substances)) {
    if (!sub.chemistry?.sources) continue;
    for (const src of sub.chemistry.sources) {
      counts[src] = counts[src] || {};
      if (sub.chemistry.formula) counts[src].formula = (counts[src].formula || 0) + 1;
      if (sub.chemistry.smiles) counts[src].smiles = (counts[src].smiles || 0) + 1;
      if (sub.chemistry.molecularWeight) counts[src].molecularWeight = (counts[src].molecularWeight || 0) + 1;
      if (sub.chemistry.iupac) counts[src].iupac = (counts[src].iupac || 0) + 1;
      if (sub.chemistry.cas) counts[src].cas = (counts[src].cas || 0) + 1;
      if (sub.chemistry.inchiKey) counts[src].inchiKey = (counts[src].inchiKey || 0) + 1;
    }
  }

  let output = "### Chemistry Fields by Source\n\n";
  output += "| Source | formula | smiles | molecularWeight | iupac | cas | inchiKey |\n";
  output += "|--------|---------|--------|-----------------|-------|-----|----------|\n";

  for (const source of sources) {
    if (!counts[source]) continue;
    const displayName = SOURCE_NAMES[source];
    let row = `| **${displayName}** |`;
    for (const field of fields) {
      row += ` ${formatCell(counts[source]?.[field])} |`;
    }
    output += row + "\n";
  }

  return output;
}

// ============================================
// PHARMACOLOGY FIELDS BY SOURCE
// ============================================

function generatePharmacologyBySource(data: ParsedData): string {
  const fields = ["mechanismOfAction", "halfLife", "receptors", "metabolism", "bioavailability"];
  const sources = Object.keys(SOURCE_NAMES);
  const counts: Record<string, Record<string, number>> = {};

  for (const sub of Object.values(data.substances)) {
    if (!sub.pharmacology?.sources) continue;
    for (const src of sub.pharmacology.sources) {
      counts[src] = counts[src] || {};
      if (sub.pharmacology.mechanismOfAction?.length) counts[src].mechanismOfAction = (counts[src].mechanismOfAction || 0) + 1;
      if (sub.pharmacology.halfLife) counts[src].halfLife = (counts[src].halfLife || 0) + 1;
      if (sub.pharmacology.receptors?.length) counts[src].receptors = (counts[src].receptors || 0) + 1;
      if (sub.pharmacology.metabolism) counts[src].metabolism = (counts[src].metabolism || 0) + 1;
      if (sub.pharmacology.bioavailability) counts[src].bioavailability = (counts[src].bioavailability || 0) + 1;
    }
  }

  let output = "### Pharmacology Fields by Source\n\n";
  output += "| Source | mechanismOfAction | halfLife | receptors | metabolism | bioavailability |\n";
  output += "|--------|-------------------|----------|-----------|------------|------------------|\n";

  for (const source of sources) {
    if (!counts[source]) continue;
    const displayName = SOURCE_NAMES[source];
    let row = `| **${displayName}** |`;
    for (const field of fields) {
      row += ` ${formatCell(counts[source]?.[field])} |`;
    }
    output += row + "\n";
  }

  return output;
}

// ============================================
// HARM REDUCTION BY SOURCE
// ============================================

function generateHarmReductionBySource(data: ParsedData): string {
  const fields = ["rules", "shortTermRisks", "longTermRisks"];
  const sources = Object.keys(SOURCE_NAMES);
  const counts: Record<string, Record<string, number>> = {};

  for (const sub of Object.values(data.substances)) {
    if (!sub.harmReduction?.sources) continue;
    for (const src of sub.harmReduction.sources) {
      counts[src] = counts[src] || {};
      if (sub.harmReduction.rules?.length) counts[src].rules = (counts[src].rules || 0) + 1;
      if (sub.harmReduction.shortTermRisks?.length) counts[src].shortTermRisks = (counts[src].shortTermRisks || 0) + 1;
      if (sub.harmReduction.longTermRisks?.length) counts[src].longTermRisks = (counts[src].longTermRisks || 0) + 1;
    }
  }

  let output = "### Harm Reduction Fields by Source\n\n";
  output += "| Source | rules | shortTermRisks | longTermRisks |\n";
  output += "|--------|-------|----------------|---------------|\n";

  for (const source of sources) {
    if (!counts[source]) continue;
    const displayName = SOURCE_NAMES[source];
    let row = `| **${displayName}** |`;
    for (const field of fields) {
      row += ` ${formatCell(counts[source]?.[field])} |`;
    }
    output += row + "\n";
  }

  return output;
}

// ============================================
// CORE DATA BY SOURCE (Structured)
// ============================================

function generateCoreDataBySource(data: ParsedData): string {
  const sources = Object.keys(SOURCE_NAMES);
  const counts: Record<string, Record<string, Set<string>>> = {};

  for (const [slug, sub] of Object.entries(data.substances)) {
    // Dosage
    for (const item of sub.dosage || []) {
      counts[item.source] = counts[item.source] || {};
      counts[item.source].dosage = counts[item.source].dosage || new Set();
      counts[item.source].dosage.add(slug);
    }

    // Duration
    for (const item of sub.duration || []) {
      counts[item.source] = counts[item.source] || {};
      counts[item.source].duration = counts[item.source].duration || new Set();
      counts[item.source].duration.add(slug);
    }

    // Effects
    for (const item of sub.effects || []) {
      counts[item.source] = counts[item.source] || {};
      counts[item.source].effects = counts[item.source].effects || new Set();
      counts[item.source].effects.add(slug);
    }

    // Interactions
    for (const item of sub.interactions || []) {
      counts[item.source] = counts[item.source] || {};
      counts[item.source].interactions = counts[item.source].interactions || new Set();
      counts[item.source].interactions.add(slug);
    }

    // Legal
    for (const item of sub.legal || []) {
      counts[item.source] = counts[item.source] || {};
      counts[item.source].legal = counts[item.source].legal || new Set();
      counts[item.source].legal.add(slug);
    }

    // Tolerance
    for (const item of sub.tolerance || []) {
      counts[item.source] = counts[item.source] || {};
      counts[item.source].tolerance = counts[item.source].tolerance || new Set();
      counts[item.source].tolerance.add(slug);
    }
  }

  const fields = ["dosage", "duration", "effects", "interactions", "legal", "tolerance"];

  let output = "### Core Structured Data by Source\n\n";
  output += "| Source | dosage | duration | effects | interactions | legal | tolerance |\n";
  output += "|--------|--------|----------|---------|--------------|-------|------------|\n";

  for (const source of sources) {
    if (!counts[source]) continue;
    const displayName = SOURCE_NAMES[source];
    let row = `| **${displayName}** |`;
    for (const field of fields) {
      row += ` ${formatCell(counts[source]?.[field]?.size)} |`;
    }
    output += row + "\n";
  }

  return output;
}

// ============================================
// NARRATIVE BY SOURCE
// ============================================

function generateNarrativeBySource(data: ParsedData): string {
  const counts: Record<string, Record<string, Set<string>>> = {};
  const charCounts: Record<string, number> = {};

  for (const [slug, sub] of Object.entries(data.substances)) {
    for (const note of sub.narrativeContent?.generalNotes || []) {
      const field = NARRATIVE_TO_FIELD[note.section] || note.section;
      counts[note.source] = counts[note.source] || {};
      counts[note.source][field] = counts[note.source][field] || new Set();
      counts[note.source][field].add(slug);
      charCounts[note.source] = (charCounts[note.source] || 0) + (note.content?.length || 0);
    }

    for (const exp of sub.narrativeContent?.experienceReports || []) {
      counts[exp.source] = counts[exp.source] || {};
      counts[exp.source].experience = counts[exp.source].experience || new Set();
      counts[exp.source].experience.add(slug);
      charCounts[exp.source] = (charCounts[exp.source] || 0) + (exp.content?.length || 0);
    }

    for (const syn of sub.narrativeContent?.synthesis || []) {
      counts[syn.source] = counts[syn.source] || {};
      counts[syn.source].synthesis = counts[syn.source].synthesis || new Set();
      counts[syn.source].synthesis.add(slug);
      charCounts[syn.source] = (charCounts[syn.source] || 0) + (syn.content?.length || 0);
    }

    for (const qc of sub.narrativeContent?.qualitativeComments || []) {
      counts[qc.source] = counts[qc.source] || {};
      counts[qc.source].commentary = counts[qc.source].commentary || new Set();
      counts[qc.source].commentary.add(slug);
      charCounts[qc.source] = (charCounts[qc.source] || 0) + (qc.content?.length || 0);
    }
  }

  // Key narrative fields
  const fields = ["overview", "history", "chemistry", "pharmacology", "effects", "harmReduction", "experience"];

  let output = "### Narrative Content by Source\n\n";
  output += "| Source | Size | overview | history | chemistry | pharmacology | effects | harmReduction | experience |\n";
  output += "|--------|------|----------|---------|-----------|--------------|---------|---------------|------------|\n";

  const sources = Object.keys(SOURCE_NAMES);
  for (const source of sources) {
    if (!counts[source]) continue;
    const displayName = SOURCE_NAMES[source];
    const size = charCounts[source] ? `${(charCounts[source] / 1024).toFixed(0)}KB` : "-";
    let row = `| **${displayName}** | ${size} |`;
    for (const field of fields) {
      row += ` ${formatCell(counts[source]?.[field]?.size)} |`;
    }
    output += row + "\n";
  }

  return output;
}

// ============================================
// NARRATIVE SECTIONS DETAIL
// ============================================

function generateNarrativeSectionsDetail(data: ParsedData): string {
  const sectionsBySource: Record<string, Record<string, number>> = {};

  for (const sub of Object.values(data.substances)) {
    for (const note of sub.narrativeContent?.generalNotes || []) {
      const field = NARRATIVE_TO_FIELD[note.section] || note.section;
      sectionsBySource[note.source] = sectionsBySource[note.source] || {};
      sectionsBySource[note.source][field] = (sectionsBySource[note.source][field] || 0) + 1;
    }

    for (const exp of sub.narrativeContent?.experienceReports || []) {
      sectionsBySource[exp.source] = sectionsBySource[exp.source] || {};
      sectionsBySource[exp.source].experience = (sectionsBySource[exp.source].experience || 0) + 1;
    }

    for (const syn of sub.narrativeContent?.synthesis || []) {
      sectionsBySource[syn.source] = sectionsBySource[syn.source] || {};
      sectionsBySource[syn.source].synthesis = (sectionsBySource[syn.source].synthesis || 0) + 1;
    }

    for (const qc of sub.narrativeContent?.qualitativeComments || []) {
      sectionsBySource[qc.source] = sectionsBySource[qc.source] || {};
      sectionsBySource[qc.source].commentary = (sectionsBySource[qc.source].commentary || 0) + 1;
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

  let output = "### Structured vs Narrative Overlap\n\n";
  output += "| Field | Both | Narrative Only | Structured Only | Total Coverage |\n";
  output += "|-------|------|----------------|-----------------|----------------|\n";

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
    output += `| ${field} | ${both} | ${narrOnly} | ${structOnly} | ${formatPct(total)} |\n`;
  }

  return output;
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
