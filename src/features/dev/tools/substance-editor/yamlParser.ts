import { isSubstancePriority, type SubstanceArticle } from "@/schema";
import { normalizeHarmPotential } from "./yamlParserHarmPotential";
import {
  normalizeCitations,
  normalizeClassification,
  normalizeComparisons,
  normalizeDosage,
  normalizeDuration,
  normalizeEditorialReview,
  normalizeHistoryCulture,
  normalizeIdentification,
  normalizeInteractions,
  normalizeLegality,
  normalizePharmacology,
  normalizeReagentTesting,
  normalizeSourceCitations,
  normalizeSubjectiveEffects,
  normalizeTolerance,
} from "./yamlParserSectionNormalizers";
import { getString, getStringArray, isObjectRecord } from "./yamlParserShared";

const REFERENCE_TEMPLATES = new Set([
  "cite_journal",
  "cite_book",
  "cite_web",
  "cite_report",
  "cite_database",
  "unknown",
]);

function normalizeReferences(raw: unknown): SubstanceArticle["references"] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((reference) => {
    if (!isObjectRecord(reference)) {
      return reference as SubstanceArticle["references"][number];
    }

    if (
      typeof reference.template === "string" &&
      !REFERENCE_TEMPLATES.has(reference.template)
    ) {
      return { ...reference, template: "unknown" } as SubstanceArticle["references"][number];
    }

    return reference as SubstanceArticle["references"][number];
  });
}

/**
 * Normalizes the parsed YAML into a proper SubstanceArticle with defaults.
 * This provides defensive parsing to handle missing or malformed fields.
 */
export function normalizeArticleInput(raw: Record<string, unknown>): SubstanceArticle {
  const priority = isSubstancePriority(raw.priority) ? raw.priority : "normal";

  return {
    id: typeof raw.id === "number" ? raw.id : null,
    title: getString(raw.title),
    priority,
    index_categories: getStringArray(raw.index_categories),
    identification: normalizeIdentification(raw.identification),
    summary: getString(raw.summary),
    classification: normalizeClassification(raw.classification),
    dosage: normalizeDosage(raw.dosage),
    duration: normalizeDuration(raw.duration),
    subjective_effects: normalizeSubjectiveEffects(raw.subjective_effects),
    comparisons: normalizeComparisons(raw.comparisons),
    pharmacology: normalizePharmacology(raw.pharmacology),
    interactions: normalizeInteractions(raw.interactions),
    reagent_testing: normalizeReagentTesting(raw.reagent_testing),
    harm_potential: normalizeHarmPotential(raw.harm_potential),
    tolerance: normalizeTolerance(raw.tolerance),
    history_culture: normalizeHistoryCulture(raw.history_culture),
    legality: normalizeLegality(raw.legality),
    editorial_review: normalizeEditorialReview(raw.editorial_review),
    references: normalizeReferences(raw.references),
    source_citations: normalizeSourceCitations(raw.source_citations),
    citations: normalizeCitations(raw.citations),
  };
}
