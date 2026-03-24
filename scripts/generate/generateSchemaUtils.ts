/**
 * Schema generation script for Phase 3.
 * Generates:
 * - defaults.generated.ts (createEmptyArticle function)
 * - fieldRegistry.generated.ts (base field entries)
 *
 * Run with: npm run generate:schema
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  substanceArticleSchema,
  doseRangeSchema,
  durationStageSchema,
  plateauDoseSchema,
} from "../../src/schema/substance.schema";
import type { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "../../src/data/schema");

// ============================================================================
// Type Inference Helpers
// ============================================================================

type ZodType = z.ZodTypeAny;

/**
 * Get the Zod type name from a schema
 */
function getZodTypeName(schema: ZodType): string {
  return (schema as { type?: string }).type ?? "unknown";
}

/**
 * Unwrap nullable/optional types to get the inner type
 */
function unwrapType(schema: ZodType): ZodType {
  const typeName = getZodTypeName(schema);
  const def = (schema as { def?: { innerType?: ZodType } }).def;

  if (typeName === "default" && def?.innerType) {
    return unwrapType(def.innerType);
  }
  if (typeName === "nullable" && def?.innerType) {
    return def.innerType;
  }
  if (typeName === "optional" && def?.innerType) {
    return def.innerType;
  }
  return schema;
}

/**
 * Check if a schema represents a nullable type
 */
function isNullable(schema: ZodType): boolean {
  return getZodTypeName(schema) === "nullable";
}

/**
 * Get the element type for array schemas
 */
function getArrayElement(schema: ZodType): ZodType | undefined {
  const def = (schema as { def?: { element?: ZodType } }).def;
  return def?.element;
}

/**
 * Get the shape of an object schema
 */
function getObjectShape(
  schema: ZodType
): Record<string, ZodType> | undefined {
  return (schema as { shape?: Record<string, ZodType> }).shape;
}

// ============================================================================
// Default Value Generation
// ============================================================================

/**
 * Generate a default value for a Zod schema type
 */
function generateDefault(schema: ZodType): unknown {
  const typeName = getZodTypeName(schema);
  const def = (schema as { def?: { innerType?: ZodType; defaultValue?: unknown } }).def;

  switch (typeName) {
    case "default":
      return def?.defaultValue;
    case "string":
      return "";
    case "number":
      return null; // Numbers default to null for this schema
    case "optional": {
      const inner = unwrapType(schema);
      const innerType = getZodTypeName(inner);
      if (innerType === "object" || innerType === "array" || innerType === "record") {
        return generateDefault(inner);
      }
      if (innerType === "number") {
        return null;
      }
      return undefined;
    }
    case "nullable": {
      const inner = unwrapType(schema);
      // For nullable numbers, return null; for nullable objects, generate defaults
      const innerType = getZodTypeName(inner);
      if (innerType === "number") return null;
      if (innerType === "object") return null; // plateau_dosing defaults to null
      return null;
    }
    case "array":
      return [];
    case "record":
      return {};
    case "object": {
      const shape = getObjectShape(schema);
      if (!shape) return {};
      const obj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) {
        obj[key] = generateDefault(value);
      }
      return obj;
    }
    default:
      return null;
  }
}

/**
 * Generate the createEmptyArticle function as TypeScript code
 */
function generateDefaultsFile(): string {
  const defaults = generateDefault(substanceArticleSchema) as Record<string, unknown>;
  const pharmacology = (defaults.pharmacology ??= {}) as Record<string, unknown>;
  pharmacology.route_bioavailability ??= {};
  pharmacology.route_half_life ??= {};
  pharmacology.route_half_life_notes ??= {};
  pharmacology.route_bioavailability_notes ??= {};

  defaults.harm_potential ??= {};
  const harmPotential = defaults.harm_potential as Record<string, unknown>;
  harmPotential.addiction ??= {
    psychological: { level: null, description: "" },
    physical_dependence: { level: null, description: "" },
  };
  harmPotential.toxicity ??= {};
  const toxicity = harmPotential.toxicity as Record<string, unknown>;
  toxicity.lethal_dosage ??= { ld50: [], notes: "" };
  toxicity.organ_toxicity ??= [];
  toxicity.carcinogenicity ??= { level: null, evidence: null, description: "" };
  toxicity.antibiotic_function ??= { level: null, description: "" };
  harmPotential.psychosis ??= { level: null, description: "" };
  harmPotential.seizure ??= { level: null, description: "" };

  defaults.history_culture ??= { content: "", sections: [] };
  defaults.source_citations ??= [];

  const json = JSON.stringify(defaults, null, 2);

  return `/**
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 * Generated by: npm run generate:schema
 * Source: src/schema/substance.schema.ts
 */

import type { SubstanceArticle } from "../../schema";

/**
 * Create an empty SubstanceArticle with default values derived from the Zod schema.
 */
export function createEmptyArticle(): SubstanceArticle {
  return ${json.replace(/"([^"]+)":/g, "$1:")};
}
`;
}

// ============================================================================
// Field Registry Generation
// ============================================================================

interface GeneratedFieldMeta {
  path: string;
  type: string;
  default: unknown;
  isNullable: boolean;
  isArray: boolean;
}

/**
 * Check if a path represents a compound dose range field (threshold, light, etc.)
 * These should be treated as single "dose" type fields, not expanded into min/max/unit
 */
function isDoseRangeField(path: string): boolean {
  const doseRangePattern = /dose_ranges\.(threshold|light|moderate|strong|heavy)$/;
  return doseRangePattern.test(path);
}

/**
 * Check if a path represents a compound duration stage field (onset, peak, etc.)
 * These should be treated as single "duration" type fields
 */
function isDurationStageField(path: string): boolean {
  const stagePattern = /stages\.(onset|come_up|peak|offset|after_effects|total_duration)$/;
  return stagePattern.test(path);
}

/**
 * Check if a path is a known compound field that shouldn't be expanded further
 */
function isCompoundField(path: string): boolean {
  return isDoseRangeField(path) || isDurationStageField(path);
}

/**
 * Map Zod types to field registry types
 */
function mapToFieldType(schema: ZodType, path: string): string {
  const typeName = getZodTypeName(schema);

  // Special cases based on path patterns - compound fields
  if (isDoseRangeField(path)) return "dose";
  if (isDurationStageField(path)) return "duration";
  if (path === "citations") return "citation";

  // Check for arrays that should be tagArray
  if (typeName === "array") {
    const element = getArrayElement(schema);
    if (element && getZodTypeName(element) === "string") {
      return "tagArray";
    }
    return "array";
  }

  // Check for records
  if (typeName === "record") return "object";

  // Handle nullable by checking inner type
  if (typeName === "nullable") {
    const inner = unwrapType(schema);
    const innerType = getZodTypeName(inner);
    if (innerType === "number") return "number";
    if (innerType === "object") return "object";
  }

  // Base types
  switch (typeName) {
    case "string":
      return "text";
    case "number":
      return "number";
    case "object":
      return "object";
    default:
      return "text";
  }
}

/**
 * Recursively extract all field paths from a Zod object schema
 */
function extractFieldPaths(
  schema: ZodType,
  prefix: string = "",
  results: GeneratedFieldMeta[] = []
): GeneratedFieldMeta[] {
  const typeName = getZodTypeName(schema);

  if (typeName === "object") {
    const shape = getObjectShape(schema);
    if (!shape) return results;

    for (const [key, value] of Object.entries(shape)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      const valueType = getZodTypeName(value);

      // Check if this is a compound field that should NOT be expanded further
      if (isCompoundField(currentPath)) {
        results.push({
          path: currentPath,
          type: mapToFieldType(value, currentPath),
          default: null, // Compound fields use null default
          isNullable: false,
          isArray: false,
        });
        continue;
      }

      // Handle arrays with object elements (route-dependent fields)
      if (valueType === "array") {
        const element = getArrayElement(value);
        if (element && getZodTypeName(element) === "object") {
          // Check if this is a "simple" array that should be treated as a whole
          // (like citations, comparisons) vs expanded (like routes)
          const isExpandableArray = currentPath === "dosage.routes" ||
                                    currentPath === "duration.routes";

          if (isExpandableArray) {
            // For route arrays, use template notation and expand
            const templatePath = `${currentPath}[]`;
            extractFieldPaths(element, templatePath, results);
          } else {
            // For citations/comparisons, register as a whole object field
            results.push({
              path: currentPath,
              type: currentPath === "citations" ? "citation" : "object",
              default: [],
              isNullable: false,
              isArray: true,
            });
          }
        } else {
          // Simple array of strings - register as leaf
          results.push({
            path: currentPath,
            type: mapToFieldType(value, currentPath),
            default: generateDefault(value),
            isNullable: false,
            isArray: true,
          });
        }
        continue;
      }

      // Handle nested objects (but not records)
      if (valueType === "object") {
        const innerShape = getObjectShape(value);
        if (innerShape) {
          extractFieldPaths(value, currentPath, results);
          continue;
        }
      }

      // Handle records (like reagent_testing, receptor_binding, countries)
      if (valueType === "record") {
        results.push({
          path: currentPath,
          type: "object",
          default: {},
          isNullable: false,
          isArray: false,
        });
        continue;
      }

      // Handle nullable objects (like plateau_dosing)
      if (valueType === "nullable") {
        const inner = unwrapType(value);
        if (getZodTypeName(inner) === "object") {
          // Check if it's a simple object or structured
          const innerShape = getObjectShape(inner);
          if (innerShape) {
            // Register the parent as nullable object
            results.push({
              path: currentPath,
              type: "object",
              default: null,
              isNullable: true,
              isArray: false,
            });
            continue;
          }
        }
      }

      // Leaf node - register it
      results.push({
        path: currentPath,
        type: mapToFieldType(value, currentPath),
        default: generateDefault(value),
        isNullable: isNullable(value),
        isArray: false,
      });
    }
  }

  return results;
}

/**
 * Generate the field registry file as TypeScript code
 */
function generateFieldRegistryFile(): string {
  const fields = extractFieldPaths(substanceArticleSchema);

  const entries = fields
    .map((field) => {
      const defaultStr =
        field.default === null
          ? "null"
          : field.default === ""
            ? '""'
            : JSON.stringify(field.default);

      return `  "${field.path}": {
    path: "${field.path}",
    type: "${field.type}",
    default: ${defaultStr},
    isNullable: ${field.isNullable},
  }`;
    })
    .join(",\n");

  return `/**
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 * Generated by: npm run generate:schema
 * Source: src/schema/substance.schema.ts
 *
 * This file contains base field metadata derived from the Zod schema.
 * Manual overrides (labels, sections, transformers) are defined in fieldOverrides.ts
 */

export interface GeneratedFieldMeta {
  path: string;
  type: string;
  default: unknown;
  isNullable: boolean;
}

export const GENERATED_FIELD_REGISTRY: Record<string, GeneratedFieldMeta> = {
${entries}
};

/**
 * List of all field paths in the schema
 */
export const FIELD_PATHS = [
${fields.map((f) => `  "${f.path}"`).join(",\n")}
] as const;

export type FieldPath = typeof FIELD_PATHS[number];
`;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log("Generating schema utilities...\n");

  // Generate defaults file
  const defaultsContent = generateDefaultsFile();
  const defaultsPath = path.join(OUTPUT_DIR, "defaults.generated.ts");
  fs.writeFileSync(defaultsPath, defaultsContent, "utf-8");
  console.log(`✓ Generated: ${path.relative(process.cwd(), defaultsPath)}`);

  // Generate field registry file
  const registryContent = generateFieldRegistryFile();
  const registryPath = path.join(OUTPUT_DIR, "fieldRegistry.generated.ts");
  fs.writeFileSync(registryPath, registryContent, "utf-8");
  console.log(`✓ Generated: ${path.relative(process.cwd(), registryPath)}`);

  // Count fields
  const fields = extractFieldPaths(substanceArticleSchema);
  console.log(`\n📊 Generated ${fields.length} field entries`);

  console.log("\nDone! Now update fieldRegistry.ts to use generated + overrides.");
}

main();
