/**
 * Central field registry defining metadata for all SubstanceArticle fields.
 *
 * This registry is built by merging:
 * 1. Auto-generated base entries from the Zod schema (fieldRegistry.generated.ts)
 * 2. Manual overrides with labels, sections, transformers, etc. (fieldOverrides.ts)
 *
 * Run `npm run generate:schema` to regenerate the base registry when the schema changes.
 */

import type { FieldMeta } from "./types";
import { GENERATED_FIELD_REGISTRY } from "./fieldRegistry.generated";
import { FIELD_OVERRIDES } from "./fieldOverrides";

/**
 * Merge generated field metadata with manual overrides.
 * Overrides take precedence over generated values.
 */
function buildFieldRegistry(): Record<string, FieldMeta> {
  const registry: Record<string, FieldMeta> = {};

  // Start with generated entries
  for (const [path, generated] of Object.entries(GENERATED_FIELD_REGISTRY)) {
    const override = FIELD_OVERRIDES[path];

    if (override) {
      // Merge generated with override (override takes precedence)
      registry[path] = {
        path,
        label: override.label,
        type: override.type ?? (generated.type as FieldMeta["type"]),
        required: override.required ?? false,
        default: override.default ?? generated.default,
        section: override.section,
        transformer: override.transformer,
        placeholder: override.placeholder,
        description: override.description,
        routeDependent: override.routeDependent,
      };
    } else {
      // No override - use generated with default label
      registry[path] = {
        path,
        label: humanizeFieldPath(path),
        type: generated.type as FieldMeta["type"],
        required: false,
        default: generated.default,
        section: inferSection(path),
      };
    }
  }

  // Also add any fields that are in overrides but not in generated
  // (in case overrides define fields that weren't auto-discovered)
  for (const [path, override] of Object.entries(FIELD_OVERRIDES)) {
    if (!registry[path]) {
      registry[path] = {
        path,
        label: override.label,
        type: override.type ?? "text",
        required: override.required ?? false,
        default: override.default ?? "",
        section: override.section,
        transformer: override.transformer,
        placeholder: override.placeholder,
        description: override.description,
        routeDependent: override.routeDependent,
      };
    }
  }

  return registry;
}

/**
 * Convert a field path to a human-readable label.
 * Used as fallback when no override is provided.
 */
function humanizeFieldPath(path: string): string {
  // Get the last segment of the path
  const segments = path.replace(/\[\]/g, "").split(".");
  const lastSegment = segments[segments.length - 1];

  // Convert snake_case to Title Case
  return lastSegment
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Infer a section from a field path.
 * Used as fallback when no override is provided.
 */
function inferSection(path: string): FieldMeta["section"] {
  const segments = path.split(".");
  const firstSegment = segments[0].replace(/\[\]/g, "");

  // Map top-level keys to sections
  const sectionMap: Record<string, FieldMeta["section"]> = {
    id: "meta",
    title: "meta",
    index_categories: "meta",
    summary: "meta",
    identification: "identification",
    classification: "classification",
    dosage: "dosage",
    duration: "duration",
    subjective_effects: "subjective_effects",
    comparisons: "subjective_effects",
    pharmacology: "pharmacology",
    interactions: "interactions",
    reagent_testing: "identification",
    tolerance: "tolerance",
    harm_potential: "harm_potential",
    legality: "legality",
    citations: "citations",
  };

  return sectionMap[firstSegment] ?? "meta";
}

/**
 * The merged field registry - single source of truth for field metadata.
 */
export const FIELD_REGISTRY: Record<string, FieldMeta> = buildFieldRegistry();

/**
 * Get field metadata by path
 */
export function getFieldMeta(path: string): FieldMeta | undefined {
  return FIELD_REGISTRY[path];
}

/**
 * Get all fields for a specific section
 */
export function getFieldsForSection(sectionKey: string): FieldMeta[] {
  return Object.values(FIELD_REGISTRY).filter((field) => field.section === sectionKey);
}

/**
 * Get all route-dependent fields
 */
export function getRouteDependentFields(): FieldMeta[] {
  return Object.values(FIELD_REGISTRY).filter((field) => field.routeDependent);
}

/**
 * Get all required fields
 */
export function getRequiredFields(): FieldMeta[] {
  return Object.values(FIELD_REGISTRY).filter((field) => field.required);
}
