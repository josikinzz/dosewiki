/**
 * Source Coverage & Overlap Analysis
 *
 * Generates comprehensive tables showing:
 * 1. Per-field coverage by source
 * 2. Source overlap matrices
 * 3. Exclusive vs shared data
 */

import * as fs from "fs";
import type { ParsedSubstanceData } from "../parsers/types";

interface ParsedSourcesOutput {
  substances: Record<string, ParsedSubstanceData>;
}

// Fields to analyze
const FIELDS = [
  "dosage",
  "duration",
  "effects",
  "interactions",
  "chemistry",
  "pharmacology",
  "legal",
  "tolerance",
  "harmReduction",
  "narrativeContent",
] as const;

type Field = typeof FIELDS[number];

// All known sources
const ALL_SOURCES = [
  "tripsit-factsheets",
  "tripsit-wiki",
  "psychonautwiki",
  "drugbank",
  "erowid",
  "isomerdesign",
  "saferparty",
  "disregardeverythingisay",
  "drugusersbible",
  "thedrugclassroom",
  "wikipedia",
  "tripsit-combos",
];

// Short names for display
const SOURCE_SHORT: Record<string, string> = {
  "tripsit-factsheets": "TS-Facts",
  "tripsit-wiki": "TS-Wiki",
  "psychonautwiki": "PsychWiki",
  "drugbank": "DrugBank",
  "erowid": "Erowid",
  "isomerdesign": "Isomer",
  "saferparty": "SaferP",
  "disregardeverythingisay": "DEIS",
  "drugusersbible": "DUB",
  "thedrugclassroom": "DrugClass",
  "wikipedia": "Wikipedia",
  "tripsit-combos": "TS-Combos",
};

function getSourcesForField(substance: ParsedSubstanceData, field: Field): Set<string> {
  const sources = new Set<string>();

  switch (field) {
    case "dosage":
      substance.dosage?.forEach(d => sources.add(d.source));
      break;
    case "duration":
      substance.duration?.forEach(d => sources.add(d.source));
      break;
    case "effects":
      substance.effects?.forEach(e => sources.add(e.source));
      break;
    case "interactions":
      substance.interactions?.forEach(i => sources.add(i.source));
      break;
    case "chemistry":
      substance.chemistry?.sources?.forEach(s => sources.add(s));
      break;
    case "pharmacology":
      substance.pharmacology?.sources?.forEach(s => sources.add(s));
      break;
    case "legal":
      substance.legal?.forEach(l => sources.add(l.source));
      break;
    case "tolerance":
      if (Array.isArray(substance.tolerance)) {
        substance.tolerance.forEach(t => sources.add(t.source));
      }
      break;
    case "harmReduction":
      substance.harmReduction?.sources?.forEach(s => sources.add(s));
      break;
    case "narrativeContent":
      substance.narrativeContent?.experienceReports?.forEach(r => sources.add(r.source));
      substance.narrativeContent?.synthesis?.forEach(s => sources.add(s.source));
      substance.narrativeContent?.qualitativeComments?.forEach(q => sources.add(q.source));
      substance.narrativeContent?.generalNotes?.forEach(n => sources.add(n.source));
      break;
  }

  return sources;
}

function analyze(data: ParsedSourcesOutput) {
  const substances = Object.values(data.substances);
  const totalSubstances = substances.length;

  // Coverage: source → field → count
  const coverage: Record<string, Record<Field, number>> = {};
  // Overlap: field → source1 → source2 → count (substances with both)
  const overlap: Record<Field, Record<string, Record<string, number>>> = {} as any;
  // Exclusive: field → source → count (substances with ONLY this source for this field)
  const exclusive: Record<Field, Record<string, number>> = {} as any;
  // Total per field
  const fieldTotals: Record<Field, number> = {} as any;

  // Initialize structures
  for (const source of ALL_SOURCES) {
    coverage[source] = {} as any;
    for (const field of FIELDS) {
      coverage[source][field] = 0;
    }
  }

  for (const field of FIELDS) {
    overlap[field] = {};
    exclusive[field] = {};
    fieldTotals[field] = 0;
    for (const source of ALL_SOURCES) {
      overlap[field][source] = {};
      exclusive[field][source] = 0;
      for (const source2 of ALL_SOURCES) {
        overlap[field][source][source2] = 0;
      }
    }
  }

  // Analyze each substance
  for (const substance of substances) {
    for (const field of FIELDS) {
      const sources = getSourcesForField(substance, field);

      if (sources.size > 0) {
        fieldTotals[field]++;
      }

      // Count coverage
      for (const source of sources) {
        if (coverage[source]) {
          coverage[source][field]++;
        }
      }

      // Count overlap (pairwise)
      const sourceArray = Array.from(sources);
      for (let i = 0; i < sourceArray.length; i++) {
        for (let j = 0; j < sourceArray.length; j++) {
          if (overlap[field][sourceArray[i]] && overlap[field][sourceArray[i]][sourceArray[j]] !== undefined) {
            overlap[field][sourceArray[i]][sourceArray[j]]++;
          }
        }
      }

      // Count exclusive
      if (sources.size === 1) {
        const source = sourceArray[0];
        if (exclusive[field][source] !== undefined) {
          exclusive[field][source]++;
        }
      }
    }
  }

  return { coverage, overlap, exclusive, fieldTotals, totalSubstances };
}

function printCoverageTable(coverage: Record<string, Record<Field, number>>, fieldTotals: Record<Field, number>, total: number) {
  console.log("\n" + "=".repeat(140));
  console.log("COVERAGE BY SOURCE AND FIELD");
  console.log("Shows count and percentage of substances with data from each source for each field");
  console.log("=".repeat(140));

  // Header
  const header = ["Source", ...FIELDS.map(f => f.slice(0, 8))];
  console.log(header.map((h, i) => i === 0 ? h.padEnd(12) : h.padStart(10)).join(" | "));
  console.log("-".repeat(140));

  // Rows
  for (const source of ALL_SOURCES) {
    const row = [SOURCE_SHORT[source] || source];
    for (const field of FIELDS) {
      const count = coverage[source][field];
      const pct = ((count / total) * 100).toFixed(1);
      row.push(`${count} (${pct}%)`);
    }
    console.log(row.map((r, i) => i === 0 ? r.padEnd(12) : r.padStart(10)).join(" | "));
  }

  // Totals row
  console.log("-".repeat(140));
  const totalsRow = ["TOTAL"];
  for (const field of FIELDS) {
    const count = fieldTotals[field];
    const pct = ((count / total) * 100).toFixed(1);
    totalsRow.push(`${count} (${pct}%)`);
  }
  console.log(totalsRow.map((r, i) => i === 0 ? r.padEnd(12) : r.padStart(10)).join(" | "));
}

function printOverlapMatrix(overlap: Record<Field, Record<string, Record<string, number>>>, field: Field) {
  console.log(`\n${"=".repeat(100)}`);
  console.log(`OVERLAP MATRIX: ${field.toUpperCase()}`);
  console.log(`Shows how many substances have data from BOTH row source AND column source for ${field}`);
  console.log(`Diagonal = total substances with that source`);
  console.log("=".repeat(100));

  // Filter to sources that have data for this field
  const activeSources = ALL_SOURCES.filter(s => overlap[field][s][s] > 0);

  if (activeSources.length === 0) {
    console.log("No sources have data for this field.");
    return;
  }

  // Header
  const shortNames = activeSources.map(s => SOURCE_SHORT[s] || s.slice(0, 8));
  console.log("".padEnd(12) + shortNames.map(n => n.padStart(9)).join(" "));
  console.log("-".repeat(12 + activeSources.length * 10));

  // Rows
  for (const source of activeSources) {
    const row = [SOURCE_SHORT[source] || source];
    for (const source2 of activeSources) {
      row.push(overlap[field][source][source2].toString());
    }
    console.log(row.map((r, i) => i === 0 ? r.padEnd(12) : r.padStart(9)).join(" "));
  }
}

function printExclusiveTable(exclusive: Record<Field, Record<string, number>>, coverage: Record<string, Record<Field, number>>) {
  console.log("\n" + "=".repeat(140));
  console.log("EXCLUSIVE COVERAGE (substances with data from ONLY this source for a field)");
  console.log("Shows count of substances where this is the ONLY source for that field");
  console.log("=".repeat(140));

  // Header
  const header = ["Source", ...FIELDS.map(f => f.slice(0, 8))];
  console.log(header.map((h, i) => i === 0 ? h.padEnd(12) : h.padStart(10)).join(" | "));
  console.log("-".repeat(140));

  // Rows
  for (const source of ALL_SOURCES) {
    const row = [SOURCE_SHORT[source] || source];
    for (const field of FIELDS) {
      const excl = exclusive[field][source];
      const total = coverage[source][field];
      if (total === 0) {
        row.push("-");
      } else {
        const pct = ((excl / total) * 100).toFixed(0);
        row.push(`${excl} (${pct}%)`);
      }
    }
    console.log(row.map((r, i) => i === 0 ? r.padEnd(12) : r.padStart(10)).join(" | "));
  }
}

function printSourcePrioritySummary(coverage: Record<string, Record<Field, number>>, overlap: Record<Field, Record<string, Record<string, number>>>) {
  console.log("\n" + "=".repeat(100));
  console.log("SOURCE PRIORITY ANALYSIS");
  console.log("For each field, shows sources ranked by coverage with unique contribution");
  console.log("=".repeat(100));

  for (const field of FIELDS) {
    console.log(`\n### ${field.toUpperCase()} ###`);

    // Get sources with coverage for this field
    const sourcesWithCoverage = ALL_SOURCES
      .filter(s => coverage[s][field] > 0)
      .sort((a, b) => coverage[b][field] - coverage[a][field]);

    if (sourcesWithCoverage.length === 0) {
      console.log("  No sources have data for this field.");
      continue;
    }

    console.log("  Rank | Source          | Coverage | Self-Only | Top Overlap");
    console.log("  " + "-".repeat(80));

    for (let i = 0; i < sourcesWithCoverage.length; i++) {
      const source = sourcesWithCoverage[i];
      const cov = coverage[source][field];
      const selfOnly = overlap[field][source][source] -
        Math.max(...ALL_SOURCES.filter(s => s !== source).map(s => overlap[field][source][s]));

      // Find top overlap partner (excluding self)
      let topOverlap = "";
      let topOverlapCount = 0;
      for (const other of ALL_SOURCES) {
        if (other !== source && overlap[field][source][other] > topOverlapCount) {
          topOverlapCount = overlap[field][source][other];
          topOverlap = SOURCE_SHORT[other];
        }
      }

      console.log(`  ${(i + 1).toString().padStart(4)} | ${(SOURCE_SHORT[source] || source).padEnd(15)} | ${cov.toString().padStart(8)} | ${Math.max(0, selfOnly).toString().padStart(9)} | ${topOverlap} (${topOverlapCount})`);
    }
  }
}

function printFieldSummary(fieldTotals: Record<Field, number>, total: number) {
  console.log("\n" + "=".repeat(60));
  console.log("FIELD COVERAGE SUMMARY");
  console.log("=".repeat(60));

  const sorted = FIELDS.slice().sort((a, b) => fieldTotals[b] - fieldTotals[a]);

  console.log("Field".padEnd(20) + "Substances".padStart(12) + "Coverage %".padStart(12));
  console.log("-".repeat(44));

  for (const field of sorted) {
    const count = fieldTotals[field];
    const pct = ((count / total) * 100).toFixed(1);
    console.log(field.padEnd(20) + count.toString().padStart(12) + (pct + "%").padStart(12));
  }
}

// Main
const dataPath = "./src/data/parsed-sources.json";
const data: ParsedSourcesOutput = JSON.parse(fs.readFileSync(dataPath, "utf8"));

console.log("Source Coverage & Overlap Analysis");
console.log(`Total substances: ${Object.keys(data.substances).length}`);
console.log(`Analysis date: ${new Date().toISOString()}`);

const { coverage, overlap, exclusive, fieldTotals, totalSubstances } = analyze(data);

// Print all tables
printFieldSummary(fieldTotals, totalSubstances);
printCoverageTable(coverage, fieldTotals, totalSubstances);
printExclusiveTable(exclusive, coverage);

// Print overlap matrices for key fields
for (const field of ["dosage", "duration", "effects", "interactions", "chemistry"] as Field[]) {
  printOverlapMatrix(overlap, field);
}

printSourcePrioritySummary(coverage, overlap);
