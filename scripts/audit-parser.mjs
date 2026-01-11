#!/usr/bin/env node
/**
 * Audit the parser - compare raw source files to what was extracted
 * Find dosage/duration data that EXISTS in sources but WASN'T parsed
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/parsed-sources.json"), "utf-8"));
const sourcesDir = path.join(ROOT, "src/data/article-sources");

// Get all source files
const sourceFiles = fs.readdirSync(sourcesDir).filter(f => f.endsWith(".ts") && f !== "index.ts" && f !== "prompt.ts");

console.log(`Found ${sourceFiles.length} source files\n`);

// Patterns that indicate dosage data exists in source
const DOSAGE_PATTERNS = [
  /dosage/i,
  /\b\d+\s*-\s*\d+\s*(mg|µg|ug|mcg|g)\b/i,  // "100-200mg"
  /threshold|light|common|moderate|strong|heavy/i,
  /dose/i,
];

const DURATION_PATTERNS = [
  /duration/i,
  /onset|come.?up|peak|offset|after.?effects/i,
  /\b\d+\s*-\s*\d+\s*(minutes?|hours?|mins?|hrs?)\b/i,
  /total.*(\d+.*hours?|\d+.*minutes?)/i,
];

// Check each source file
const missingDosage = [];
const missingDuration = [];
const hasDosageInSource = [];
const hasDurationInSource = [];

for (const file of sourceFiles) {
  const slug = file.replace(".ts", "");
  const filePath = path.join(sourcesDir, file);

  let content;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    continue;
  }

  const parsedData = parsed.substances[slug];
  const parsedHasDosage = parsedData?.dosage?.length > 0;
  const parsedHasDuration = parsedData?.duration?.length > 0;

  // Check if source file contains dosage-like content
  const sourceHasDosagePatterns = DOSAGE_PATTERNS.some(p => p.test(content));
  const sourceHasDurationPatterns = DURATION_PATTERNS.some(p => p.test(content));

  // More specific check - look for actual dose values
  const hasDoseValues = /\b\d+\s*[-–]\s*\d+\s*(mg|µg|ug|mcg|g|ml)\b/i.test(content);
  const hasDurationValues = /\b\d+\s*[-–]\s*\d+\s*(minutes?|hours?|mins?|hrs?|h)\b/i.test(content);

  if (sourceHasDosagePatterns && hasDoseValues) {
    hasDosageInSource.push(slug);
    if (!parsedHasDosage) {
      missingDosage.push({
        slug,
        file,
        // Extract a sample of what looks like dosage data
        sample: extractDosageSample(content)
      });
    }
  }

  if (sourceHasDurationPatterns && hasDurationValues) {
    hasDurationInSource.push(slug);
    if (!parsedHasDuration) {
      missingDuration.push({
        slug,
        file,
        sample: extractDurationSample(content)
      });
    }
  }
}

function extractDosageSample(content) {
  // Find lines that look like dosage data
  const lines = content.split('\n');
  const samples = [];
  for (let i = 0; i < lines.length && samples.length < 5; i++) {
    const line = lines[i];
    if (/\b\d+\s*[-–]\s*\d+\s*(mg|µg|ug|mcg|g)\b/i.test(line) ||
        /(threshold|light|common|moderate|strong|heavy).*\d+/i.test(line) ||
        /\d+.*(threshold|light|common|moderate|strong|heavy)/i.test(line)) {
      samples.push(line.trim().substring(0, 100));
    }
  }
  return samples;
}

function extractDurationSample(content) {
  const lines = content.split('\n');
  const samples = [];
  for (let i = 0; i < lines.length && samples.length < 5; i++) {
    const line = lines[i];
    if (/\b\d+\s*[-–]\s*\d+\s*(minutes?|hours?|mins?|hrs?)\b/i.test(line) ||
        /(onset|peak|duration|come.?up|offset).*\d+/i.test(line)) {
      samples.push(line.trim().substring(0, 100));
    }
  }
  return samples;
}

// Output results
console.log("╔════════════════════════════════════════════════════════════════════╗");
console.log("║              PARSER AUDIT - MISSING EXTRACTIONS                    ║");
console.log("╚════════════════════════════════════════════════════════════════════╝\n");

console.log("┌────────────────────────────────────────────────────────────────────┐");
console.log("│                         SUMMARY                                   │");
console.log("├────────────────────────────────────────────────────────────────────┤");
console.log(`│  Source files with dosage-like content:     ${String(hasDosageInSource.length).padStart(3)}                  │`);
console.log(`│  Source files with duration-like content:   ${String(hasDurationInSource.length).padStart(3)}                  │`);
console.log(`│  ──────────────────────────────────────────────────────────────── │`);
console.log(`│  DOSAGE DATA MISSED BY PARSER:              ${String(missingDosage.length).padStart(3)}                  │`);
console.log(`│  DURATION DATA MISSED BY PARSER:            ${String(missingDuration.length).padStart(3)}                  │`);
console.log("└────────────────────────────────────────────────────────────────────┘\n");

if (missingDosage.length > 0) {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("DOSAGE DATA EXISTS IN SOURCE BUT NOT PARSED:");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  for (const item of missingDosage.slice(0, 30)) {
    console.log(`📁 ${item.slug}`);
    console.log(`   File: ${item.file}`);
    if (item.sample.length > 0) {
      console.log("   Sample lines from source:");
      item.sample.forEach(s => console.log(`     "${s}"`));
    }
    console.log("");
  }

  if (missingDosage.length > 30) {
    console.log(`... and ${missingDosage.length - 30} more\n`);
  }
}

if (missingDuration.length > 0) {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("DURATION DATA EXISTS IN SOURCE BUT NOT PARSED:");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  for (const item of missingDuration.slice(0, 30)) {
    console.log(`📁 ${item.slug}`);
    console.log(`   File: ${item.file}`);
    if (item.sample.length > 0) {
      console.log("   Sample lines from source:");
      item.sample.forEach(s => console.log(`     "${s}"`));
    }
    console.log("");
  }

  if (missingDuration.length > 30) {
    console.log(`... and ${missingDuration.length - 30} more\n`);
  }
}

// Also check: sources that have NO dosage/duration in parsed but DO have source sections
console.log("\n═══════════════════════════════════════════════════════════════════");
console.log("DETAILED CHECK: Substances with 0 parsed dosage");
console.log("═══════════════════════════════════════════════════════════════════\n");

let noParsedCount = 0;
for (const [slug, data] of Object.entries(parsed.substances)) {
  if (!data.dosage || data.dosage.length === 0) {
    noParsedCount++;
    if (noParsedCount <= 20) {
      const sourceFile = path.join(sourcesDir, `${slug}.ts`);
      let hasSourceFile = false;
      let sourceSnippet = "";
      try {
        const content = fs.readFileSync(sourceFile, "utf-8");
        hasSourceFile = true;
        // Check what sources are in the file
        const sources = [];
        if (content.includes("tripsit")) sources.push("tripsit");
        if (content.includes("psychonautwiki")) sources.push("psychonautwiki");
        if (content.includes("erowid")) sources.push("erowid");
        if (content.includes("drugbank")) sources.push("drugbank");
        if (content.includes("wikipedia")) sources.push("wikipedia");
        sourceSnippet = sources.join(", ") || "unknown";
      } catch (e) {
        sourceSnippet = "NO SOURCE FILE";
      }
      console.log(`  ${slug}: Sources in file: ${sourceSnippet}`);
    }
  }
}
console.log(`\nTotal substances with 0 parsed dosage: ${noParsedCount}`);
