#!/usr/bin/env node
/**
 * Analyze Drug Users Bible parser gaps
 * Identifies substances where source content has dosage/duration data
 * that isn't being extracted to parsed-sources.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load parsed-sources.json
const parsed = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/parsed-sources.json"), "utf-8")
);

// Load all article source files
const sourcesDir = path.join(ROOT, "src/data/article-sources");
const sourceFiles = fs.readdirSync(sourcesDir).filter(f => f.endsWith(".ts") && f !== "index.ts");

// Results
const results = {
  duration: {
    parsed: [],
    noSection: [],
    labelsOnly: [],
    hasDataNotParsed: []
  },
  dosage: {
    parsed: [],
    noSection: [],
    labelsOnly: [],
    hasDataNotParsed: []
  }
};

// Regex patterns for Drug Users Bible content
const durationPattern = /Anticipated:\s*Onset\s*\/\s*Duration[:\s]*\*?\*?[:\s]*(.+)/i;
const dosePattern = /Maximum Dose Experienced[:\s]*\*?\*?[:\s]*(.+)/i;

// Parse time values like "20 Seconds", "1 Hour", "6 Minutes", "10+ Hours"
const timeValuePattern = /(\d+\.?\d*)\+?\s*(Seconds?|Minutes?|Hours?|Days?)/gi;
// Parse dose values like "20mg", "1.5g", "100ug", "75ug+25ug"
const doseValuePattern = /(\d+\.?\d*)\s*(mg|g|ug|µg|ml|mcg)/gi;

for (const file of sourceFiles) {
  const slug = file.replace(".ts", "");
  const content = fs.readFileSync(path.join(sourcesDir, file), "utf-8");

  // Check if file has drugusersbible content
  if (!content.includes("drugusersbible")) {
    continue;
  }

  // Extract drugusersbible section
  const dubMatch = content.match(/"drugusersbible":\s*`([\s\S]*?)`,?\s*(?:"[a-z]|$)/);
  if (!dubMatch) continue;

  const dubContent = dubMatch[1];

  // Get parsed data for this substance
  const parsedData = parsed.substances[slug];
  const hasParsedDuration = parsedData?.duration?.some(d => d.source === "drugusersbible");
  const hasParsedDosage = parsedData?.dosage?.some(d => d.source === "drugusersbible");

  // Analyze duration
  const durationMatch = dubContent.match(durationPattern);
  if (durationMatch) {
    const value = durationMatch[1].trim();
    const hasTimeValues = timeValuePattern.test(value);
    timeValuePattern.lastIndex = 0; // Reset regex

    if (hasParsedDuration) {
      results.duration.parsed.push({ slug, excerpt: value });
    } else if (value.toLowerCase().includes("see below") ||
               value.toLowerCase().includes("dose dependent") ||
               value.toLowerCase().includes("no info") ||
               value.toLowerCase().includes("n/a")) {
      results.duration.labelsOnly.push({ slug, excerpt: value });
    } else if (hasTimeValues) {
      results.duration.hasDataNotParsed.push({ slug, excerpt: value, fullLine: durationMatch[0] });
    } else {
      results.duration.labelsOnly.push({ slug, excerpt: value });
    }
  } else {
    results.duration.noSection.push(slug);
  }

  // Analyze dosage
  const doseMatch = dubContent.match(dosePattern);
  if (doseMatch) {
    const value = doseMatch[1].trim();
    const hasDoseValues = doseValuePattern.test(value);
    doseValuePattern.lastIndex = 0; // Reset regex

    if (hasParsedDosage) {
      results.dosage.parsed.push({ slug, excerpt: value });
    } else if (value.toLowerCase().includes("unknown") ||
               value.toLowerCase().includes("not known") ||
               value.toLowerCase().includes("n/a") ||
               value.toLowerCase().includes("see")) {
      results.dosage.labelsOnly.push({ slug, excerpt: value });
    } else if (hasDoseValues) {
      results.dosage.hasDataNotParsed.push({ slug, excerpt: value, fullLine: doseMatch[0] });
    } else {
      results.dosage.labelsOnly.push({ slug, excerpt: value });
    }
  } else {
    results.dosage.noSection.push(slug);
  }
}

// Print report
console.log(`╔════════════════════════════════════════════════════════════════════╗`);
console.log(`║           DRUG USERS BIBLE PARSER GAP ANALYSIS                    ║`);
console.log(`╚════════════════════════════════════════════════════════════════════╝`);
console.log();
console.log(`┌────────────────────────────────────────────────────────────────────┐`);
console.log(`│                      DURATION SUMMARY                              │`);
console.log(`├────────────────────────────────────────────────────────────────────┤`);
console.log(`│  Successfully parsed:                               ${String(results.duration.parsed.length).padStart(3)}            │`);
console.log(`│  No section in source:                              ${String(results.duration.noSection.length).padStart(3)}            │`);
console.log(`│  Labels but no numbers:                             ${String(results.duration.labelsOnly.length).padStart(3)}            │`);
console.log(`│  ⚠️  HAS NUMBERS BUT NOT PARSED:                    ${String(results.duration.hasDataNotParsed.length).padStart(3)}            │`);
console.log(`└────────────────────────────────────────────────────────────────────┘`);
console.log();
console.log(`┌────────────────────────────────────────────────────────────────────┐`);
console.log(`│                      DOSAGE SUMMARY                                │`);
console.log(`├────────────────────────────────────────────────────────────────────┤`);
console.log(`│  Successfully parsed:                               ${String(results.dosage.parsed.length).padStart(3)}            │`);
console.log(`│  No section in source:                              ${String(results.dosage.noSection.length).padStart(3)}            │`);
console.log(`│  Labels but no numbers:                             ${String(results.dosage.labelsOnly.length).padStart(3)}            │`);
console.log(`│  ⚠️  HAS NUMBERS BUT NOT PARSED:                    ${String(results.dosage.hasDataNotParsed.length).padStart(3)}            │`);
console.log(`└────────────────────────────────────────────────────────────────────┘`);

if (results.duration.hasDataNotParsed.length > 0) {
  console.log();
  console.log(`═══════════════════════════════════════════════════════════════════`);
  console.log(`UNPARSED DURATION (HAS DATA):`);
  console.log(`═══════════════════════════════════════════════════════════════════`);
  results.duration.hasDataNotParsed.forEach((item, i) => {
    console.log();
    console.log(`${i + 1}. ${item.slug}`);
    console.log(`   Source excerpt: "${item.excerpt}"`);
    // Identify pattern issues
    if (item.excerpt.includes("/")) {
      console.log(`   Pattern: Slash-separated onset/duration`);
    }
    if (item.excerpt.includes("[")) {
      console.log(`   Pattern: Has bracketed route annotation`);
    }
    if (/ \d /.test(item.excerpt)) {
      console.log(`   Pattern: ⚠️  Space in number (OCR error?)`);
    }
  });
}

if (results.dosage.hasDataNotParsed.length > 0) {
  console.log();
  console.log(`═══════════════════════════════════════════════════════════════════`);
  console.log(`UNPARSED DOSAGE (HAS DATA):`);
  console.log(`═══════════════════════════════════════════════════════════════════`);
  results.dosage.hasDataNotParsed.forEach((item, i) => {
    console.log();
    console.log(`${i + 1}. ${item.slug}`);
    console.log(`   Source excerpt: "${item.excerpt}"`);
    // Identify pattern issues
    if (item.excerpt.includes("+")) {
      console.log(`   Pattern: Multiple doses with + separator (redosing)`);
    }
    if (item.excerpt.includes("(")) {
      console.log(`   Pattern: Has parenthetical notes`);
    }
    if (item.excerpt.includes(";")) {
      console.log(`   Pattern: Multiple routes with ; separator`);
    }
    if (/ \d /.test(item.excerpt)) {
      console.log(`   Pattern: ⚠️  Space in number (OCR error?)`);
    }
  });
}

// Priority substances check
const prioritySubstances = [
  "lsd", "mdma", "psilocybin-mushrooms", "cocaine", "cannabis", "ketamine",
  "amphetamine", "methamphetamine", "dmt", "2c-b", "ghb", "alcohol",
  "heroin", "morphine", "codeine", "oxycodone", "diazepam", "alprazolam",
  "clonazepam", "nitrous", "dextromethorphan", "kratom", "salvia", "mescaline"
];

const unparsedPriorityDuration = results.duration.hasDataNotParsed
  .filter(item => prioritySubstances.includes(item.slug));
const unparsedPriorityDosage = results.dosage.hasDataNotParsed
  .filter(item => prioritySubstances.includes(item.slug));

if (unparsedPriorityDuration.length > 0 || unparsedPriorityDosage.length > 0) {
  console.log();
  console.log(`═══════════════════════════════════════════════════════════════════`);
  console.log(`🚨 PRIORITY SUBSTANCES WITH GAPS:`);
  console.log(`═══════════════════════════════════════════════════════════════════`);
  if (unparsedPriorityDuration.length > 0) {
    console.log(`Duration gaps: ${unparsedPriorityDuration.map(i => i.slug).join(", ")}`);
  }
  if (unparsedPriorityDosage.length > 0) {
    console.log(`Dosage gaps: ${unparsedPriorityDosage.map(i => i.slug).join(", ")}`);
  }
}
