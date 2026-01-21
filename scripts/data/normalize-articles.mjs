#!/usr/bin/env node
/**
 * Normalize SubstanceIndex.json to align with the current Zod schema defaults.
 * 
 * This script fixes data inconsistencies that have accumulated over time:
 * - botanical_name: null -> ""
 * - reagent_testing: null -> {}
 * - harm_potential.toxicity: null -> { ld50: "", organ_toxicity: "", carcinogenicity: "", other: "" }
 * - harm_potential.risks: null or array -> { psychosis: "", self_harm: "", seizure: "", other: [] }
 * - Ensures priority field exists (defaults to "normal")
 * - Ensures source_citations is array or undefined (not null)
 * 
 * Usage:
 *   node scripts/data/normalize-articles.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARTICLES_PATH = join(__dirname, "../../src/data/SubstanceIndex.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// Default structures for missing/null fields
const DEFAULT_TOXICITY = {
  ld50: "",
  organ_toxicity: "",
  carcinogenicity: "",
  other: "",
};

const DEFAULT_RISKS = {
  psychosis: "",
  self_harm: "",
  seizure: "",
  other: [],
};

/**
 * Normalize a single article to match schema defaults.
 */
function normalizeArticle(article) {
  let changes = [];

  // Fix botanical_name
  if (article.identification?.botanical_name === null) {
    article.identification.botanical_name = "";
    changes.push("identification.botanical_name: null -> ''");
  }

  // Fix reagent_testing
  if (article.reagent_testing === null) {
    article.reagent_testing = {};
    changes.push("reagent_testing: null -> {}");
  }

  // Ensure priority exists
  if (!article.priority) {
    article.priority = "normal";
    changes.push("priority: undefined -> 'normal'");
  }

  // Fix harm_potential.toxicity
  if (article.harm_potential) {
    if (article.harm_potential.toxicity === null) {
      article.harm_potential.toxicity = { ...DEFAULT_TOXICITY };
      changes.push("harm_potential.toxicity: null -> default object");
    } else if (typeof article.harm_potential.toxicity === "object") {
      // Ensure all subfields exist
      const tox = article.harm_potential.toxicity;
      if (tox.ld50 === undefined) tox.ld50 = "";
      if (tox.organ_toxicity === undefined) tox.organ_toxicity = "";
      if (tox.carcinogenicity === undefined) tox.carcinogenicity = "";
      if (tox.other === undefined) tox.other = "";
    }

    // Fix harm_potential.risks
    if (article.harm_potential.risks === null || Array.isArray(article.harm_potential.risks)) {
      // Convert legacy array format to object
      const legacyOther = Array.isArray(article.harm_potential.risks) 
        ? article.harm_potential.risks 
        : [];
      article.harm_potential.risks = {
        ...DEFAULT_RISKS,
        other: legacyOther,
      };
      changes.push("harm_potential.risks: null/array -> default object");
    } else if (typeof article.harm_potential.risks === "object") {
      // Ensure all subfields exist
      const risks = article.harm_potential.risks;
      if (risks.psychosis === undefined) risks.psychosis = "";
      if (risks.self_harm === undefined) risks.self_harm = "";
      if (risks.seizure === undefined) risks.seizure = "";
      if (risks.other === undefined) risks.other = [];
    }

    // Ensure dependence_liability exists
    if (article.harm_potential.dependence_liability === undefined) {
      article.harm_potential.dependence_liability = "";
    }
  }

  // Fix source_citations (null -> undefined, which means omit from output)
  if (article.source_citations === null) {
    delete article.source_citations;
    changes.push("source_citations: null -> undefined");
  }

  // Ensure pharmacology fields exist
  if (article.pharmacology) {
    if (article.pharmacology.receptor_binding === undefined) {
      article.pharmacology.receptor_binding = {};
    }
    if (article.pharmacology.metabolism === undefined) {
      article.pharmacology.metabolism = "";
    }
    if (article.pharmacology.metabolites === undefined) {
      article.pharmacology.metabolites = [];
    }
    if (article.pharmacology.bioavailability_notes === undefined) {
      article.pharmacology.bioavailability_notes = "";
    }
  }

  return { article, changes };
}

function main() {
  console.log(`\n📋 Normalizing SubstanceIndex.json${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  // Read articles
  const articlesRaw = readFileSync(ARTICLES_PATH, "utf-8");
  const articles = JSON.parse(articlesRaw);

  let totalChanges = 0;
  let articlesModified = 0;

  // Process each article
  for (const article of articles) {
    const { changes } = normalizeArticle(article);
    
    if (changes.length > 0) {
      articlesModified++;
      totalChanges += changes.length;
      
      if (DRY_RUN) {
        console.log(`  ${article.title || article.id}:`);
        changes.forEach((c) => console.log(`    - ${c}`));
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Articles modified: ${articlesModified}`);
  console.log(`   Total changes: ${totalChanges}`);

  if (!DRY_RUN && totalChanges > 0) {
    // Write back
    writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2) + "\n");
    console.log(`\n✅ Wrote changes to SubstanceIndex.json`);
    console.log(`\n⚠️  Don't forget to run: node scripts/build/buildCompressedArticles.mjs`);
  } else if (DRY_RUN && totalChanges > 0) {
    console.log(`\n🔍 Dry run complete. Run without --dry-run to apply changes.`);
  } else {
    console.log(`\n✅ No changes needed. SubstanceIndex.json is already normalized.`);
  }
}

main();
