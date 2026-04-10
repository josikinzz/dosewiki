import { parse, YAMLParseError } from "yaml";
import { substanceArticleSchema, type SubstanceArticle } from "@/schema";
import { stripMarkdownCodeFences } from "../../../../../lib/article/normalization.js";
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

export interface ParseResult {
  success: boolean;
  data?: SubstanceArticle;
  error?: string;
  lineNumber?: number;
}

function parseYamlRecord(
  yamlString: string,
  objectErrorMessage: string,
): Record<string, unknown> {
  const parsed = parse(stripMarkdownCodeFences(yamlString));

  if (!isObjectRecord(parsed)) {
    throw new Error(objectErrorMessage);
  }

  return parsed;
}

export function parseSectionYamlObject<T extends Record<string, unknown> = Record<string, unknown>>(
  yamlString: string,
): T {
  if (!yamlString.trim()) {
    throw new Error("Generated YAML is empty.");
  }

  return parseYamlRecord(yamlString, "Generated YAML must parse to an object.") as T;
}

/**
 * Parses a YAML string into a SubstanceArticle object.
 * Handles malformed YAML gracefully with informative error messages.
 */
export function parseGeneratedYaml(yamlString: string): ParseResult {
  if (!yamlString || !yamlString.trim()) {
    return {
      success: false,
      error: "No YAML content to parse",
    };
  }

  try {
    const article = normalizeArticleInput(
      parseYamlRecord(yamlString, "Parsed content is not a valid object"),
    );
    const validation = substanceArticleSchema.safeParse(article);

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      return {
        success: false,
        error: `Validation error at ${firstIssue.path.join(".")}: ${firstIssue.message}`,
      };
    }

    return {
      success: true,
      data: validation.data,
    };
  } catch (error) {
    if (error instanceof YAMLParseError) {
      const lineMatch = error.message.match(/at line (\d+)/);
      const lineNumber = lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined;

      return {
        success: false,
        error: `YAML parsing error: ${error.message}`,
        lineNumber,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}

/**
 * Normalizes the parsed YAML into a proper SubstanceArticle with defaults.
 * This provides defensive parsing to handle missing or malformed fields.
 */
export function normalizeArticleInput(raw: Record<string, unknown>): SubstanceArticle {
  const priority = raw.priority === "high" || raw.priority === "normal" || raw.priority === "low"
    ? raw.priority
    : "normal";

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
    source_citations: normalizeSourceCitations(raw.source_citations),
    citations: normalizeCitations(raw.citations),
  };
}
