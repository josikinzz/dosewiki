#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import { formatStructuredCitationCompatibilityError } from "./source-citations-compat.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const inputIndex = args.indexOf("--input");
if (inputIndex < 0 || !args[inputIndex + 1]) {
  throw new Error("Pass --input <path> naming the local substance export to prepopulate.");
}

const articlesPath = path.resolve(args[inputIndex + 1]);
const articleSourcesDir = path.join(repoRoot, "src/data/article-sources");

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const structuredCitationCompatibilityError = formatStructuredCitationCompatibilityError(articles);
if (structuredCitationCompatibilityError) {
  console.error(structuredCitationCompatibilityError);
  process.exit(1);
}

const runContext = createDataOpsRunContext({
  operation: "prepopulate source citations",
  intent: "local-prepopulate",
  sourceUrlKeys: [],
  localArtifacts: [path.relative(repoRoot, articlesPath), "src/data/article-sources"],
});

import { slugify } from "../lib/slug.mjs";

const SOURCE_DISPLAY_NAMES = {
  "disregardeverythingisay": "Disregard Everything I Say",
  "drugbank": "DrugBank",
  "drugusersbible": "Drug Users Bible",
  "erowid": "Erowid",
  "isomerdesign": "Isomer Design (TiHKAL/PiHKAL)",
  "psychonautwiki": "PsychonautWiki",
  "saferparty": "Safer Party",
  "thedrugclassroom": "The Drug Classroom",
  "tripsit-factsheets": "TripSit Factsheets",
  "tripsit-wiki": "TripSit Wiki",
  "wikipedia": "Wikipedia",
};

function extractSourceUrl(content) {
  const match = content.match(/\*Source:\s*(https?:\/\/[^\s*]+)\*/);
  return match ? match[1] : null;
}

function normalizeUrl(url) {
  if (!url) return "";
  return url.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

const stats = {
  articlesProcessed: 0,
  articlesUpdated: 0,
  articlesSkipped: 0,
  sourcesMissing: 0,
  sourceCitationsAdded: 0,
  citationsDeduplicated: 0,
  drugUsersBibleCount: 0,
  bySource: {},
};

const modifiedArticles = articles.map(article => {
  stats.articlesProcessed++;

  const slug = slugify(article.title);
  const sourceFilePath = path.join(articleSourcesDir, `${slug}.ts`);

  if (!fs.existsSync(sourceFilePath)) {
    stats.articlesSkipped++;
    if (verbose) {
      console.log(`  SKIP: ${article.title} (no source file)`);
    }
    return article;
  }

  const sourceContent = fs.readFileSync(sourceFilePath, "utf-8");

  const sourcesMatch = sourceContent.match(/export const sources = (\[[\s\S]*?\]);/);
  if (!sourcesMatch) {
    stats.articlesSkipped++;
    if (verbose) {
      console.log(`  SKIP: ${article.title} (no sources array found)`);
    }
    return article;
  }

  let sourcesArray;
  try {
    sourcesArray = JSON.parse(sourcesMatch[1]);
  } catch {
    stats.articlesSkipped++;
    if (verbose) {
      console.log(`  SKIP: ${article.title} (failed to parse sources)`);
    }
    return article;
  }

  const newSourceCitations = [];
  const sourceUrls = new Set();

  for (const source of sourcesArray) {
    const sourceId = source.id;
    const displayName = SOURCE_DISPLAY_NAMES[sourceId] || source.displayName;

    const contentStartRegex = new RegExp(`"${sourceId}":\\s*\``, "m");
    const startMatch = sourceContent.match(contentStartRegex);

    if (!startMatch) {
      stats.sourcesMissing++;
      continue;
    }

    const startPos = startMatch.index + startMatch[0].length;

    const contentPreview = sourceContent.substring(startPos, startPos + 500);
    const url = extractSourceUrl(contentPreview);

    stats.bySource[sourceId] = (stats.bySource[sourceId] || 0) + 1;

    if (url) {
      newSourceCitations.push({
        name: displayName,
        url: url,
      });
      sourceUrls.add(normalizeUrl(url));
      stats.sourceCitationsAdded++;
    } else if (sourceId === "drugusersbible") {
      newSourceCitations.push({
        name: "Drug Users Bible by Dominic Milton Trott",
        url: "",
      });
      stats.drugUsersBibleCount++;
      stats.sourceCitationsAdded++;
    }
  }

  if (newSourceCitations.length === 0) {
    stats.articlesSkipped++;
    if (verbose) {
      console.log(`  SKIP: ${article.title} (no source URLs extracted)`);
    }
    return article;
  }

  const existingCitations = article.citations || [];
  const deduplicatedCitations = existingCitations.filter(citation => {
    const citationUrl = normalizeUrl(citation.url);
    if (citationUrl && sourceUrls.has(citationUrl)) {
      stats.citationsDeduplicated++;
      if (verbose) {
        console.log(`    Deduplicated: ${citation.name} (${citation.url})`);
      }
      return false;
    }
    return true;
  });

  stats.articlesUpdated++;

  if (verbose) {
    console.log(`  ${article.title}: ${newSourceCitations.length} sources, ${deduplicatedCitations.length} further reading`);
  }

  return {
    ...article,
    source_citations: newSourceCitations,
    citations: deduplicatedCitations,
  };
});

console.log("\n" + "=".repeat(60));
console.log("SOURCE CITATIONS PREPOPULATION");
console.log("=".repeat(60));
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY CHANGES"}`);
printDataOpsRunContext(runContext);

console.log(`\n--- Articles ---`);
console.log(`  Total processed:     ${stats.articlesProcessed}`);
console.log(`  Updated:             ${stats.articlesUpdated}`);
console.log(`  Skipped:             ${stats.articlesSkipped}`);

console.log(`\n--- Source Citations ---`);
console.log(`  Total added:         ${stats.sourceCitationsAdded}`);
console.log(`  Drug Users Bible:    ${stats.drugUsersBibleCount}`);

console.log(`\n--- Deduplication ---`);
console.log(`  Citations removed:   ${stats.citationsDeduplicated}`);

console.log(`\n--- By Source Type ---`);
const sortedSources = Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]);
for (const [source, count] of sortedSources) {
  console.log(`  ${SOURCE_DISPLAY_NAMES[source] || source}: ${count}`);
}

if (!dryRun) {
  assertDataOpsWriteAllowed(runContext);
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: articlesPath,
    rootDir: repoRoot,
    producer: "scripts/prepopulate/prepopulate-source-citations.mjs",
    sourceDeployment: "src/data/article-sources",
    schemaVersion: "src/schema/substance.schema.ts",
    extra: {
      articlesProcessed: stats.articlesProcessed,
      articlesUpdated: stats.articlesUpdated,
      sourceCitationsAdded: stats.sourceCitationsAdded,
      citationsDeduplicated: stats.citationsDeduplicated,
    },
  });
  console.log(`\n✅ Changes written to ${articlesPath}`);
  if (lineage) {
    console.log(`🧾 Lineage metadata written to ${lineage.outputPath}`);
  }
} else {
  console.log("\n⚠️  Dry run - no changes written. Remove --dry-run to apply.");
}

console.log("");
