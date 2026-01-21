#!/usr/bin/env node
/**
 * Reorder fields in SubstanceIndex.json to match the canonical order defined in the Zod schema.
 *
 * This script reorders:
 * - Top-level article fields to match substanceArticleSchema
 * - Nested object fields (identification, dosage routes, etc.)
 *
 * Safety features:
 * - Creates timestamped backup before modification
 * - Validates no data loss via field counting
 * - Logs unexpected fields (preserves them at end)
 * - Supports --dry-run and --verbose flags
 *
 * Usage:
 *   node scripts/data/reorder-fields.mjs           # Apply reordering
 *   node scripts/data/reorder-fields.mjs --dry-run # Preview without writing
 *   node scripts/data/reorder-fields.mjs --verbose # Show detailed logging
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const articlesPath = path.resolve(__dirname, '../../src/data/SubstanceIndex.json');

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// ============================================================================
// Canonical Field Orders (from src/schema/substance.schema.ts)
// ============================================================================

/** Top-level article fields (substanceArticleSchema lines 316-338) */
const TOP_LEVEL_ORDER = [
  'id',
  'title',
  'priority',
  'index_categories',
  'identification',
  'classification',
  'summary',
  'dosage',
  'duration',
  'subjective_effects',
  'comparisons',
  'pharmacology',
  'interactions',
  'reagent_testing',
  'tolerance',
  'harm_potential',
  'history_culture',
  'legality',
  'source_citations',
  'citations',
];

/** Identification fields (identificationSchema lines 119-131) */
const IDENTIFICATION_ORDER = [
  'common_name',
  'substitutive_name',
  'iupac_name',
  'alternative_names',
  'smiles',
  'inchi_key',
  'cas_number',
  'molecular_formula',
  'molecular_weight',
  'skeletal_structure_image',
  'botanical_name',
];

/** Classification fields (classificationSchema lines 134-137) */
const CLASSIFICATION_ORDER = [
  'psychoactive_class',
  'chemical_class',
];

/** Dosage route fields (dosageRouteSchema lines 55-61) */
const DOSAGE_ROUTE_ORDER = [
  'route',
  'bioavailability',
  'bioavailability_notes',
  'dose_ranges',
  'notes',
];

/** Dose ranges fields (doseRangesSchema lines 46-52) */
const DOSE_RANGES_ORDER = [
  'threshold',
  'light',
  'moderate',
  'strong',
  'heavy',
];

/** Dose range fields (doseRangeSchema lines 16-20) */
const DOSE_RANGE_ORDER = [
  'min',
  'max',
  'unit',
];

/** Plateau dose fields (plateauDoseSchema lines 64-69) */
const PLATEAU_DOSE_ORDER = [
  'min',
  'max',
  'unit',
  'effects',
];

/** Plateau dosing fields (plateauDosingSchema lines 72-79) */
const PLATEAU_DOSING_ORDER = [
  'first_plateau',
  'second_plateau',
  'third_plateau',
  'fourth_plateau',
  'fifth_plateau',
  'notes',
];

/** Duration route fields (durationRouteSchema lines 102-107) */
const DURATION_ROUTE_ORDER = [
  'route',
  'half_life',
  'half_life_notes',
  'stages',
];

/** Duration stages fields (durationStagesSchema lines 92-99) */
const DURATION_STAGES_ORDER = [
  'onset',
  'come_up',
  'peak',
  'offset',
  'after_effects',
  'total_duration',
];

/** Duration stage fields (durationStageSchema lines 23-27) */
const DURATION_STAGE_ORDER = [
  'min',
  'max',
  'unit',
];

/** Subjective effects fields (subjectiveEffectsSchema lines 190-197) */
const SUBJECTIVE_EFFECTS_ORDER = [
  'notes',
  'sensory',
  'cognitive',
  'physical',
  'progressive_stages',
  'attribution',
];

/** Subjective effects notes fields (subjectiveEffectsNotesSchema lines 175-180) */
const SUBJECTIVE_EFFECTS_NOTES_ORDER = [
  'overview',
  'sensory',
  'cognitive',
  'physical',
];

/** Sensory effects fields (sensoryEffectsSchema lines 165-172) */
const SENSORY_EFFECTS_ORDER = [
  'visual',
  'auditory',
  'tactile',
  'olfactory',
  'gustatory',
  'multisensory',
];

/** Sense category fields (senseCategorySchema lines 159-162) */
const SENSE_CATEGORY_ORDER = [
  'note',
  'subcategories',
];

/** Effect subcategory fields (effectSubcategorySchema lines 149-152) */
const EFFECT_SUBCATEGORY_ORDER = [
  'note',
  'effects',
];

/** Effect entry fields (effectEntrySchema lines 144-147) */
const EFFECT_ENTRY_ORDER = [
  'name',
  'description',
];

/** Attribution fields (subjectiveEffectsAttributionSchema lines 183-187) */
const ATTRIBUTION_ORDER = [
  'author',
  'text',
  'url',
];

/** Pharmacology fields (pharmacologySchema lines 210-217) */
const PHARMACOLOGY_ORDER = [
  'mechanism_of_action',
  'receptor_binding',
  'metabolism',
  'metabolites',
  'protein_binding',
  'volume_of_distribution',
];

/** Interactions fields (interactionsSchema lines 224-228) */
const INTERACTIONS_ORDER = [
  'dangerous',
  'unsafe',
  'caution',
];

/** Tolerance fields (toleranceSchema lines 263-268) */
const TOLERANCE_ORDER = [
  'full_tolerance',
  'half_tolerance',
  'baseline_tolerance',
  'cross_tolerance',
];

/** Toxicity fields (toxicitySchema lines 235-240) */
const TOXICITY_ORDER = [
  'ld50',
  'organ_toxicity',
  'carcinogenicity',
  'other',
];

/** Risks fields (risksSchema lines 243-248) */
const RISKS_ORDER = [
  'psychosis',
  'self_harm',
  'seizure',
  'other',
];

/** Harm potential fields (harmPotentialSchema lines 251-256) */
const HARM_POTENTIAL_ORDER = [
  'addiction_liability',
  'dependence_liability',
  'toxicity',
  'risks',
];

/** History culture section fields (historyCultureSectionSchema lines 288-293) */
const HISTORY_CULTURE_SECTION_ORDER = [
  'heading',
  'content',
  'date_range',
  'subsections',
  'icon', // Custom field not in schema, preserve if present
];

/** History culture subsection fields (historyCultureSubsectionSchema lines 281-285) */
const HISTORY_CULTURE_SUBSECTION_ORDER = [
  'heading',
  'content',
  'date_range',
];

/** History culture date range fields (historyCultureDateRangeSchema lines 275-278) */
const HISTORY_CULTURE_DATE_RANGE_ORDER = [
  'start',
  'end',
];

/** History culture fields (historyCultureSchema lines 296-299) */
const HISTORY_CULTURE_ORDER = [
  'content',
  'sections',
];

/** Legality fields (legalitySchema lines 306-309) */
const LEGALITY_ORDER = [
  'international',
  'countries',
];

/** Country legality fields (countryLegalitySchema lines 36-39) */
const COUNTRY_LEGALITY_ORDER = [
  'status',
  'notes',
];

/** Citation fields (citationSchema lines 30-33) */
const CITATION_ORDER = [
  'name',
  'url',
];

/** Drug comparison fields (drugComparisonSchema lines 204-207) */
const DRUG_COMPARISON_ORDER = [
  'drug',
  'comparison',
];

// ============================================================================
// Reordering Functions
// ============================================================================

/**
 * Reorder object fields according to canonical order.
 * Preserves unexpected fields at the end.
 */
function orderObject(source, order, context = '') {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source;
  }

  const ordered = {};
  const sourceKeys = Object.keys(source);
  const unexpectedKeys = [];

  // Add keys in canonical order first
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      ordered[key] = source[key];
    }
  }

  // Append unexpected keys at end (preserves data)
  for (const key of sourceKeys) {
    if (!order.includes(key)) {
      unexpectedKeys.push(key);
      ordered[key] = source[key];
    }
  }

  // Log unexpected fields
  if (verbose && unexpectedKeys.length > 0) {
    console.log(`  [warn] Unexpected fields in ${context}: ${unexpectedKeys.join(', ')}`);
  }

  return ordered;
}

/** Reorder dose range object */
function reorderDoseRange(doseRange) {
  if (!doseRange) return doseRange;
  return orderObject(doseRange, DOSE_RANGE_ORDER, 'dose_range');
}

/** Reorder dose ranges object */
function reorderDoseRanges(doseRanges) {
  if (!doseRanges) return doseRanges;
  const result = {};
  for (const tier of DOSE_RANGES_ORDER) {
    if (Object.prototype.hasOwnProperty.call(doseRanges, tier)) {
      result[tier] = reorderDoseRange(doseRanges[tier]);
    }
  }
  // Preserve any unexpected tiers
  for (const key of Object.keys(doseRanges)) {
    if (!DOSE_RANGES_ORDER.includes(key)) {
      result[key] = reorderDoseRange(doseRanges[key]);
    }
  }
  return result;
}

/** Reorder plateau dose object */
function reorderPlateauDose(plateauDose) {
  if (!plateauDose) return plateauDose;
  return orderObject(plateauDose, PLATEAU_DOSE_ORDER, 'plateau_dose');
}

/** Reorder plateau dosing object */
function reorderPlateauDosing(plateauDosing) {
  if (plateauDosing === null || plateauDosing === undefined) return plateauDosing;
  const result = {};
  for (const plateau of PLATEAU_DOSING_ORDER) {
    if (Object.prototype.hasOwnProperty.call(plateauDosing, plateau)) {
      if (plateau === 'notes') {
        result[plateau] = plateauDosing[plateau];
      } else {
        result[plateau] = reorderPlateauDose(plateauDosing[plateau]);
      }
    }
  }
  // Preserve any unexpected fields
  for (const key of Object.keys(plateauDosing)) {
    if (!PLATEAU_DOSING_ORDER.includes(key)) {
      result[key] = plateauDosing[key];
    }
  }
  return result;
}

/** Reorder dosage route object */
function reorderDosageRoute(route) {
  if (!route) return route;
  const result = { ...route };
  if (result.dose_ranges) {
    result.dose_ranges = reorderDoseRanges(result.dose_ranges);
  }
  return orderObject(result, DOSAGE_ROUTE_ORDER, 'dosage_route');
}

/** Reorder dosage object */
function reorderDosage(dosage) {
  if (!dosage) return dosage;
  const result = { ...dosage };
  if (result.routes && Array.isArray(result.routes)) {
    result.routes = result.routes.map(reorderDosageRoute);
  }
  if (result.plateau_dosing) {
    result.plateau_dosing = reorderPlateauDosing(result.plateau_dosing);
  }
  return orderObject(result, ['routes', 'plateau_dosing'], 'dosage');
}

/** Reorder duration stage object */
function reorderDurationStage(stage) {
  if (!stage) return stage;
  return orderObject(stage, DURATION_STAGE_ORDER, 'duration_stage');
}

/** Reorder duration stages object */
function reorderDurationStages(stages) {
  if (stages === null || stages === undefined) return stages;
  const result = {};
  for (const stage of DURATION_STAGES_ORDER) {
    if (Object.prototype.hasOwnProperty.call(stages, stage)) {
      result[stage] = reorderDurationStage(stages[stage]);
    }
  }
  // Preserve any unexpected stages
  for (const key of Object.keys(stages)) {
    if (!DURATION_STAGES_ORDER.includes(key)) {
      result[key] = reorderDurationStage(stages[key]);
    }
  }
  return result;
}

/** Reorder duration route object */
function reorderDurationRoute(route) {
  if (!route) return route;
  const result = { ...route };
  if (result.stages) {
    result.stages = reorderDurationStages(result.stages);
  }
  return orderObject(result, DURATION_ROUTE_ORDER, 'duration_route');
}

/** Reorder duration object */
function reorderDuration(duration) {
  if (!duration) return duration;
  const result = { ...duration };
  if (result.routes && Array.isArray(result.routes)) {
    result.routes = result.routes.map(reorderDurationRoute);
  }
  return orderObject(result, ['routes'], 'duration');
}

/** Reorder effect entry object */
function reorderEffectEntry(entry) {
  if (!entry) return entry;
  return orderObject(entry, EFFECT_ENTRY_ORDER, 'effect_entry');
}

/** Reorder effect subcategory object */
function reorderEffectSubcategory(subcategory) {
  if (!subcategory) return subcategory;
  const result = { ...subcategory };
  if (result.effects && Array.isArray(result.effects)) {
    result.effects = result.effects.map(reorderEffectEntry);
  }
  return orderObject(result, EFFECT_SUBCATEGORY_ORDER, 'effect_subcategory');
}

/** Reorder effect category (record of subcategories) */
function reorderEffectCategory(category) {
  if (!category || typeof category !== 'object' || Array.isArray(category)) return category;
  const result = {};
  for (const key of Object.keys(category)) {
    result[key] = reorderEffectSubcategory(category[key]);
  }
  return result;
}

/** Reorder sense category object */
function reorderSenseCategory(senseCategory) {
  if (!senseCategory || Array.isArray(senseCategory)) return senseCategory;
  const result = { ...senseCategory };
  if (result.subcategories) {
    result.subcategories = reorderEffectCategory(result.subcategories);
  }
  return orderObject(result, SENSE_CATEGORY_ORDER, 'sense_category');
}

/** Reorder sensory effects object */
function reorderSensoryEffects(sensory) {
  if (sensory === null || sensory === undefined || Array.isArray(sensory)) return sensory;
  const result = {};
  for (const sense of SENSORY_EFFECTS_ORDER) {
    if (Object.prototype.hasOwnProperty.call(sensory, sense)) {
      result[sense] = reorderSenseCategory(sensory[sense]);
    }
  }
  // Preserve any unexpected senses
  for (const key of Object.keys(sensory)) {
    if (!SENSORY_EFFECTS_ORDER.includes(key)) {
      result[key] = reorderSenseCategory(sensory[key]);
    }
  }
  return result;
}

/** Reorder subjective effects object */
function reorderSubjectiveEffects(effects) {
  if (!effects) return effects;
  const result = { ...effects };

  if (result.notes) {
    result.notes = orderObject(result.notes, SUBJECTIVE_EFFECTS_NOTES_ORDER, 'subjective_effects.notes');
  }
  if (result.sensory) {
    result.sensory = reorderSensoryEffects(result.sensory);
  }
  if (result.cognitive) {
    result.cognitive = reorderEffectCategory(result.cognitive);
  }
  if (result.physical) {
    result.physical = reorderEffectCategory(result.physical);
  }
  if (result.progressive_stages) {
    result.progressive_stages = reorderEffectCategory(result.progressive_stages);
  }
  if (result.attribution) {
    result.attribution = orderObject(result.attribution, ATTRIBUTION_ORDER, 'attribution');
  }

  return orderObject(result, SUBJECTIVE_EFFECTS_ORDER, 'subjective_effects');
}

/** Reorder pharmacology object */
function reorderPharmacology(pharmacology) {
  if (!pharmacology) return pharmacology;
  return orderObject(pharmacology, PHARMACOLOGY_ORDER, 'pharmacology');
}

/** Reorder interactions object */
function reorderInteractions(interactions) {
  if (!interactions) return interactions;
  return orderObject(interactions, INTERACTIONS_ORDER, 'interactions');
}

/** Reorder tolerance object */
function reorderTolerance(tolerance) {
  if (!tolerance) return tolerance;
  return orderObject(tolerance, TOLERANCE_ORDER, 'tolerance');
}

/** Reorder toxicity object */
function reorderToxicity(toxicity) {
  if (!toxicity) return toxicity;
  return orderObject(toxicity, TOXICITY_ORDER, 'toxicity');
}

/** Reorder risks object */
function reorderRisks(risks) {
  if (!risks) return risks;
  return orderObject(risks, RISKS_ORDER, 'risks');
}

/** Reorder harm potential object */
function reorderHarmPotential(harmPotential) {
  if (!harmPotential) return harmPotential;
  const result = { ...harmPotential };
  if (result.toxicity) {
    result.toxicity = reorderToxicity(result.toxicity);
  }
  if (result.risks) {
    result.risks = reorderRisks(result.risks);
  }
  return orderObject(result, HARM_POTENTIAL_ORDER, 'harm_potential');
}

/** Reorder history culture date range object */
function reorderHistoryCultureDateRange(dateRange) {
  if (!dateRange) return dateRange;
  return orderObject(dateRange, HISTORY_CULTURE_DATE_RANGE_ORDER, 'date_range');
}

/** Reorder history culture subsection object */
function reorderHistoryCultureSubsection(subsection) {
  if (!subsection) return subsection;
  const result = { ...subsection };
  if (result.date_range) {
    result.date_range = reorderHistoryCultureDateRange(result.date_range);
  }
  return orderObject(result, HISTORY_CULTURE_SUBSECTION_ORDER, 'history_culture_subsection');
}

/** Reorder history culture section object */
function reorderHistoryCultureSection(section) {
  if (!section) return section;
  const result = { ...section };
  if (result.date_range) {
    result.date_range = reorderHistoryCultureDateRange(result.date_range);
  }
  if (result.subsections && Array.isArray(result.subsections)) {
    result.subsections = result.subsections.map(reorderHistoryCultureSubsection);
  }
  return orderObject(result, HISTORY_CULTURE_SECTION_ORDER, 'history_culture_section');
}

/** Reorder history culture object */
function reorderHistoryCulture(historyCulture) {
  if (!historyCulture) return historyCulture;
  const result = { ...historyCulture };
  if (result.sections && Array.isArray(result.sections)) {
    result.sections = result.sections.map(reorderHistoryCultureSection);
  }
  return orderObject(result, HISTORY_CULTURE_ORDER, 'history_culture');
}

/** Reorder country legality object */
function reorderCountryLegality(countryLegality) {
  if (!countryLegality) return countryLegality;
  return orderObject(countryLegality, COUNTRY_LEGALITY_ORDER, 'country_legality');
}

/** Reorder legality object */
function reorderLegality(legality) {
  if (!legality) return legality;
  const result = { ...legality };
  if (result.countries && typeof result.countries === 'object') {
    const countries = {};
    for (const country of Object.keys(result.countries)) {
      countries[country] = reorderCountryLegality(result.countries[country]);
    }
    result.countries = countries;
  }
  return orderObject(result, LEGALITY_ORDER, 'legality');
}

/** Reorder citation object */
function reorderCitation(citation) {
  if (!citation) return citation;
  return orderObject(citation, CITATION_ORDER, 'citation');
}

/** Reorder comparison object */
function reorderComparison(comparison) {
  if (!comparison) return comparison;
  return orderObject(comparison, DRUG_COMPARISON_ORDER, 'comparison');
}

/** Reorder a single article */
function reorderArticle(article, index) {
  if (!article || typeof article !== 'object') return article;

  const result = { ...article };
  const context = article.title || `article[${index}]`;

  // Reorder nested objects
  if (result.identification) {
    result.identification = orderObject(result.identification, IDENTIFICATION_ORDER, `${context}.identification`);
  }
  if (result.classification) {
    result.classification = orderObject(result.classification, CLASSIFICATION_ORDER, `${context}.classification`);
  }
  if (result.dosage) {
    result.dosage = reorderDosage(result.dosage);
  }
  if (result.duration) {
    result.duration = reorderDuration(result.duration);
  }
  if (result.subjective_effects) {
    result.subjective_effects = reorderSubjectiveEffects(result.subjective_effects);
  }
  if (result.comparisons && Array.isArray(result.comparisons)) {
    result.comparisons = result.comparisons.map(reorderComparison);
  }
  if (result.pharmacology) {
    result.pharmacology = reorderPharmacology(result.pharmacology);
  }
  if (result.interactions) {
    result.interactions = reorderInteractions(result.interactions);
  }
  if (result.tolerance) {
    result.tolerance = reorderTolerance(result.tolerance);
  }
  if (result.harm_potential) {
    result.harm_potential = reorderHarmPotential(result.harm_potential);
  }
  if (result.history_culture) {
    result.history_culture = reorderHistoryCulture(result.history_culture);
  }
  if (result.legality) {
    result.legality = reorderLegality(result.legality);
  }
  if (result.source_citations && Array.isArray(result.source_citations)) {
    result.source_citations = result.source_citations.map(reorderCitation);
  }
  if (result.citations && Array.isArray(result.citations)) {
    result.citations = result.citations.map(reorderCitation);
  }

  return orderObject(result, TOP_LEVEL_ORDER, context);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Count all primitive values in an object (for validation).
 * Order-independent count ensures no data loss.
 */
function countPrimitives(obj, path = '') {
  if (obj === null || obj === undefined) {
    return 1;
  }
  if (typeof obj !== 'object') {
    return 1;
  }
  if (Array.isArray(obj)) {
    let count = 0;
    for (let i = 0; i < obj.length; i++) {
      count += countPrimitives(obj[i], `${path}[${i}]`);
    }
    return count;
  }
  let count = 0;
  for (const key of Object.keys(obj)) {
    count += countPrimitives(obj[key], `${path}.${key}`);
  }
  return count;
}

/**
 * Create order-independent hash of object content.
 */
function contentHash(obj) {
  // Sort keys recursively for order-independent comparison
  const sortedJson = JSON.stringify(obj, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((result, k) => {
        result[k] = value[k];
        return result;
      }, {});
    }
    return value;
  });
  return crypto.createHash('sha256').update(sortedJson).digest('hex').slice(0, 16);
}

// ============================================================================
// Main Execution
// ============================================================================

function main() {
  console.log('Reordering SubstanceIndex.json fields to canonical order...\n');

  // Read current file
  if (!fs.existsSync(articlesPath)) {
    console.error(`Error: SubstanceIndex.json not found at ${articlesPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(articlesPath, 'utf8');
  const articles = JSON.parse(raw);

  if (!Array.isArray(articles)) {
    console.error('Error: SubstanceIndex.json must be an array');
    process.exit(1);
  }

  console.log(`Found ${articles.length} articles`);

  // Calculate pre-reorder stats
  const beforeCount = countPrimitives(articles);
  const beforeHash = contentHash(articles);

  if (verbose) {
    console.log(`Before: ${beforeCount} primitive values, hash: ${beforeHash}`);
  }

  // Reorder all articles
  const ordered = articles.map((article, index) => {
    if (verbose) {
      console.log(`\nProcessing: ${article.title || `article[${index}]`}`);
    }
    return reorderArticle(article, index);
  });

  // Calculate post-reorder stats
  const afterCount = countPrimitives(ordered);
  const afterHash = contentHash(ordered);

  if (verbose) {
    console.log(`\nAfter: ${afterCount} primitive values, hash: ${afterHash}`);
  }

  // Validate no data loss
  if (beforeCount !== afterCount) {
    console.error(`\nError: Primitive count mismatch! Before: ${beforeCount}, After: ${afterCount}`);
    console.error('This indicates data was lost or added during reordering.');
    process.exit(1);
  }

  if (beforeHash !== afterHash) {
    console.error(`\nError: Content hash mismatch! Before: ${beforeHash}, After: ${afterHash}`);
    console.error('This indicates content was modified during reordering.');
    process.exit(1);
  }

  console.log('\nValidation passed: no data loss detected');

  if (dryRun) {
    console.log('\n[DRY RUN] Would write reordered articles to:', articlesPath);

    // Show a sample of the reordered structure
    if (ordered.length > 0) {
      console.log('\nSample reordered article top-level fields:');
      console.log('  ' + Object.keys(ordered[0]).join(', '));
    }

    console.log('\nRun without --dry-run to apply changes.');
    return;
  }

  // Create timestamped backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = articlesPath.replace('.json', `.backup.${timestamp}.json`);
  fs.copyFileSync(articlesPath, backupPath);
  console.log(`\nCreated backup: ${path.basename(backupPath)}`);

  // Write reordered file
  const output = JSON.stringify(ordered, null, 2) + '\n';
  fs.writeFileSync(articlesPath, output);
  console.log(`Wrote reordered articles to: ${path.basename(articlesPath)}`);

  console.log('\n✓ Reordering complete');
  console.log('\nNext steps:');
  console.log('  1. Run: node scripts/build/buildCompressedArticles.mjs');
  console.log('  2. Run: npm run dev');
  console.log('  3. Verify articles render correctly');
}

main();
