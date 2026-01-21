/**
 * Migrate Selected Fields from Old SubstanceIndex.json
 *
 * Migrates 4 specific fields from the old dose.wiki codebase:
 * - chemical_class
 * - psychoactive_class
 * - mechanism_of_action
 * - citations
 *
 * Usage: npx tsx scripts/data/migrateOldFields.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for old schema
interface OldCitation {
  name: string;
  reference: string;
}

interface OldDrugInfo {
  drug_name?: string;
  chemical_class?: string;
  psychoactive_class?: string;
  mechanism_of_action?: string;
  alternative_name?: string;
  citations?: OldCitation[];
}

interface OldArticle {
  id: number;
  title: string;
  drug_info?: OldDrugInfo;
}

// Type for new schema citation
interface NewCitation {
  name: string;
  url: string;
}

// Slugify function (matches src/utils/slug.ts)
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

// Split semicolon-delimited string into array
function splitField(value: string | undefined): string[] {
  if (!value || !value.trim()) return [];
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Map old citations to new format
function mapCitations(oldCites: OldCitation[] | undefined): NewCitation[] {
  if (!oldCites || oldCites.length === 0) return [];
  return oldCites.map((c) => ({ name: c.name, url: c.reference }));
}

// Create empty article structure (matches defaults.generated.ts)
function createEmptyArticle() {
  return {
    id: null as null,
    title: "",
    index_categories: [] as string[],
    identification: {
      common_name: "",
      substitutive_name: "",
      iupac_name: "",
      alternative_names: [] as string[],
      smiles: "",
      inchi_key: "",
      cas_number: "",
      molecular_formula: "",
      molecular_weight: "",
      skeletal_structure_image: "",
    },
    summary: "",
    classification: {
      psychoactive_class: [] as string[],
      chemical_class: [] as string[],
    },
    dosage: {
      routes: [] as unknown[],
      plateau_dosing: null as null,
    },
    duration: {
      routes: [] as unknown[],
    },
    subjective_effects: {
      notes: {
        overview: "",
        sensory: "",
        cognitive: "",
        physical: "",
      },
      sensory: {
        visual: [] as string[],
        auditory: [] as string[],
        tactile: [] as string[],
        olfactory: [] as string[],
        gustatory: [] as string[],
        multisensory: [] as string[],
      },
      cognitive: [] as string[],
      physical: [] as string[],
    },
    comparisons: [] as unknown[],
    pharmacology: {
      mechanism_of_action: [] as string[],
      receptor_binding: {} as Record<string, string>,
      metabolism: "",
      metabolites: [] as string[],
      half_life: "",
      bioavailability_notes: "",
    },
    interactions: {
      dangerous: [] as string[],
      unsafe: [] as string[],
      caution: [] as string[],
    },
    reagent_testing: {} as Record<string, string>,
    harm_potential: {
      addiction_liability: "",
      dependence_liability: "",
      toxicity: {
        ld50: "",
        organ_toxicity: "",
        carcinogenicity: "",
        other: "",
      },
      risks: {
        psychosis: "",
        self_harm: "",
        seizure: "",
        other: [] as string[],
      },
    },
    tolerance: {
      full_tolerance: "",
      half_tolerance: "",
      baseline_tolerance: "",
      cross_tolerance: [] as string[],
    },
    legality: {
      international: [] as string[],
      countries: {} as Record<string, { status: string; notes: string }>,
    },
    citations: [] as NewCitation[],
  };
}

// Known false positive alias matches to exclude
const FALSE_POSITIVE_ALIASES = new Set([
  "dmaa", // "DMAA" in Memantine's aliases is a different compound than methylhexanamine
]);

// Main migration function
function migrate() {
  // Paths
  const oldPath = "/Users/josie/Documents/Utilities/dose.wiki old/src/data/SubstanceIndex.json";
  const newPath = path.resolve(__dirname, "../../src/data/SubstanceIndex.json");
  const articleSourcesPath = path.resolve(__dirname, "../../src/data/article-sources");

  // Load old articles
  console.log("Loading old articles...");
  const oldArticles: OldArticle[] = JSON.parse(fs.readFileSync(oldPath, "utf8"));
  console.log(`  Loaded ${oldArticles.length} old articles`);

  // Get list of article-source slugs
  console.log("Scanning article-sources...");
  const sourceFiles = fs
    .readdirSync(articleSourcesPath)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => f.replace(".ts", ""));
  console.log(`  Found ${sourceFiles.length} article-source files`);

  // Build lookup maps
  const titleToOld = new Map<string, OldArticle>();
  const aliasToOld = new Map<string, OldArticle>();

  for (const article of oldArticles) {
    // Map by title slug
    const titleSlug = slugify(article.title);
    titleToOld.set(titleSlug, article);

    // Map by alternative names
    const altNames = article.drug_info?.alternative_name || "";
    if (altNames) {
      const aliases = altNames.split(";").map((a) => a.trim()).filter(Boolean);
      for (const alias of aliases) {
        const aliasSlug = slugify(alias);
        // Don't overwrite title matches with aliases
        if (!titleToOld.has(aliasSlug)) {
          aliasToOld.set(aliasSlug, article);
        }
      }
    }

    // Also map by drug_name if different from title
    const drugName = article.drug_info?.drug_name;
    if (drugName && drugName !== article.title) {
      const drugSlug = slugify(drugName);
      if (!titleToOld.has(drugSlug)) {
        aliasToOld.set(drugSlug, article);
      }
    }
  }

  // Match and migrate
  const migratedArticles: ReturnType<typeof createEmptyArticle>[] = [];
  const titleMatches: string[] = [];
  const aliasMatches: Array<{ slug: string; oldTitle: string }> = [];
  const unmatched: string[] = [];

  for (const slug of sourceFiles) {
    let oldArticle: OldArticle | undefined;
    let matchType: "title" | "alias" | null = null;

    // Primary match: by title
    if (titleToOld.has(slug)) {
      oldArticle = titleToOld.get(slug);
      matchType = "title";
      titleMatches.push(slug);
    }
    // Secondary match: by alias (exclude known false positives)
    else if (aliasToOld.has(slug) && !FALSE_POSITIVE_ALIASES.has(slug)) {
      oldArticle = aliasToOld.get(slug);
      matchType = "alias";
      aliasMatches.push({ slug, oldTitle: oldArticle!.title });
    } else {
      unmatched.push(slug);
      continue;
    }

    if (!oldArticle) continue;

    // Create new article with migrated fields
    const newArticle = createEmptyArticle();
    newArticle.title = oldArticle.title;

    // Migrate classification fields
    newArticle.classification.chemical_class = splitField(oldArticle.drug_info?.chemical_class);
    newArticle.classification.psychoactive_class = splitField(oldArticle.drug_info?.psychoactive_class);

    // Migrate pharmacology.mechanism_of_action
    newArticle.pharmacology.mechanism_of_action = splitField(oldArticle.drug_info?.mechanism_of_action);

    // Migrate citations (from drug_info.citations)
    newArticle.citations = mapCitations(oldArticle.drug_info?.citations);

    migratedArticles.push(newArticle);
  }

  // Sort by title for consistent output
  migratedArticles.sort((a, b) => a.title.localeCompare(b.title));

  // Output results
  console.log("\n=== MIGRATION RESULTS ===");
  console.log(`Title matches: ${titleMatches.length}`);
  console.log(`Alias matches: ${aliasMatches.length}`);
  console.log(`Total migrated: ${migratedArticles.length}`);
  console.log(`Unmatched slugs: ${unmatched.length}`);

  // Print alias matches for review
  console.log("\n=== ALIAS MATCHES (review for false positives) ===");
  for (const { slug, oldTitle } of aliasMatches) {
    console.log(`  ${slug} ← "${oldTitle}"`);
  }

  // Write output
  console.log("\n=== WRITING OUTPUT ===");
  fs.writeFileSync(newPath, JSON.stringify(migratedArticles, null, 2) + "\n");
  console.log(`Wrote ${migratedArticles.length} articles to ${newPath}`);

  // Spot-check a few
  console.log("\n=== SPOT CHECK ===");
  const checks = ["3-meo-pcp", "lsd", "methcathinone"];
  for (const slug of checks) {
    const article = migratedArticles.find((a) => slugify(a.title) === slug);
    if (article) {
      console.log(`\n${article.title}:`);
      console.log(`  chemical_class: ${JSON.stringify(article.classification.chemical_class)}`);
      console.log(`  psychoactive_class: ${JSON.stringify(article.classification.psychoactive_class)}`);
      console.log(`  mechanism_of_action: ${JSON.stringify(article.pharmacology.mechanism_of_action).substring(0, 80)}...`);
      console.log(`  citations: ${article.citations.length} entries`);
    }
  }
}

// Run
migrate();
