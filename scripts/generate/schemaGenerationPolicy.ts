import type { z } from "zod";

export type ZodType = z.ZodTypeAny;

export interface GeneratedFieldMeta {
  path: string;
  type: string;
  default: unknown;
  isNullable: boolean;
  isArray: boolean;
}

export const FIELD_REGISTRY_SECTION_ORDER = [
  "meta",
  "identification",
  "classification",
  "dosage",
  "duration",
  "subjective_effects",
  "pharmacology",
  "interactions",
  "tolerance",
  "harm_potential",
  "legality",
  "citations",
] as const;

export type FieldRegistrySection = (typeof FIELD_REGISTRY_SECTION_ORDER)[number];

const FIELD_REGISTRY_SECTION_BY_ROOT: Record<string, FieldRegistrySection> = {
  id: "meta",
  title: "meta",
  priority: "meta",
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
  history_culture: "meta",
  editorial_review: "meta",
  references: "citations",
  source_citations: "citations",
  citations: "citations",
};

const EXPANDABLE_ARRAY_PATHS = new Set(["dosage.routes", "duration.routes"]);
const EXCLUDED_FIELD_REGISTRY_PATHS = new Set([
  "harm_potential.toxicity.ld50",
]);

/**
 * Compatibility defaults are intentional additions for generated article
 * helpers that are not fully represented by direct Zod default extraction.
 */
function applyArticleCompatibilityDefaults(
  defaults: Record<string, unknown>,
): Record<string, unknown> {
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
  if (toxicity.lethal_dosage && typeof toxicity.lethal_dosage === "object" && !Array.isArray(toxicity.lethal_dosage)) {
    (toxicity.lethal_dosage as Record<string, unknown>).notes ??= "";
  }
  toxicity.organ_toxicity ??= [];
  toxicity.carcinogenicity ??= {
    level: null,
    evidence: null,
    description: "",
  };
  toxicity.antibiotic_function ??= { level: null, description: "" };
  toxicity.other ??= "";
  harmPotential.psychosis ??= { level: null, description: "" };
  harmPotential.seizure ??= { level: null, description: "" };

  defaults.history_culture ??= { content: "", sections: [] };
  defaults.source_citations ??= [];

  return defaults;
}

export function generateArticleDefaults(schema: ZodType): Record<string, unknown> {
  return applyArticleCompatibilityDefaults(
    generateDefault(schema) as Record<string, unknown>,
  );
}

/**
 * Get the Zod type name from a schema.
 */
function getZodTypeName(schema: ZodType): string {
  return (schema as { type?: string }).type ?? "unknown";
}

/**
 * Unwrap nullable/optional/default types to get the inner type.
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
    if (getZodTypeName(def.innerType) === "nullable") {
      return def.innerType;
    }
    return unwrapType(def.innerType);
  }
  return schema;
}

/**
 * Check if a schema represents a nullable type.
 */
function isNullable(schema: ZodType): boolean {
  return getZodTypeName(schema) === "nullable";
}

/**
 * Get the element type for array schemas.
 */
function getArrayElement(schema: ZodType): ZodType | undefined {
  const def = (schema as { def?: { element?: ZodType } }).def;
  return def?.element;
}

function getUnionOptions(schema: ZodType): ZodType[] {
  const def = (schema as { def?: { options?: ZodType[] } }).def;
  return def?.options ?? [];
}

function getUnionObjectOption(schema: ZodType): ZodType | undefined {
  return getUnionOptions(schema).map((option) => unwrapType(option)).find((option) => getZodTypeName(option) === "object");
}

/**
 * Get the shape of an object schema.
 */
function getObjectShape(
  schema: ZodType,
): Record<string, ZodType> | undefined {
  return (schema as { shape?: Record<string, ZodType> }).shape;
}

/**
 * Generate a default value for a Zod schema type.
 */
export function generateDefault(schema: ZodType): unknown {
  const typeName = getZodTypeName(schema);
  const def = (
    schema as { def?: { innerType?: ZodType; defaultValue?: unknown } }
  ).def;

  switch (typeName) {
    case "default":
      return def?.defaultValue;
    case "string":
      return "";
    case "number":
      return null;
    case "optional": {
      const inner = unwrapType(schema);
      const innerType = getZodTypeName(inner);
      if (
        innerType === "object" ||
        innerType === "array" ||
        innerType === "record"
      ) {
        return generateDefault(inner);
      }
      if (innerType === "number") {
        return null;
      }
      return undefined;
    }
    case "nullable": {
      const inner = unwrapType(schema);
      const innerType = getZodTypeName(inner);
      if (innerType === "number") return null;
      if (innerType === "object") return null;
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

function isDoseRangeField(path: string): boolean {
  const doseRangePattern = /dose_ranges\.(threshold|light|moderate|strong|heavy)$/;
  return doseRangePattern.test(path);
}

function isDurationStageField(path: string): boolean {
  const stagePattern =
    /stages\.(onset|come_up|peak|offset|after_effects|total_duration)$/;
  return stagePattern.test(path);
}

export function isCompoundField(path: string): boolean {
  return isDoseRangeField(path) || isDurationStageField(path);
}

export function isExpandableArrayPath(path: string): boolean {
  return EXPANDABLE_ARRAY_PATHS.has(path);
}

export function mapToFieldType(schema: ZodType, path: string): string {
  const typeName = getZodTypeName(schema);

  if (isDoseRangeField(path)) return "dose";
  if (isDurationStageField(path)) return "duration";
  if (path === "references") return "reference";
  if (path === "citations" || path === "source_citations") return "citation";
  if (path.endsWith(".reference_ids")) return "array";

  if (typeName === "array") {
    const element = getArrayElement(schema);
    if (element && getZodTypeName(element) === "string") {
      return "tagArray";
    }
    return "array";
  }

  if (typeName === "record") return "object";

  if (typeName === "nullable") {
    const inner = unwrapType(schema);
    const innerType = getZodTypeName(inner);
    if (innerType === "number") return "number";
    if (innerType === "object") return "object";
  }

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

export function extractFieldPaths(
  schema: ZodType,
  prefix = "",
  results: GeneratedFieldMeta[] = [],
): GeneratedFieldMeta[] {
  const typeName = getZodTypeName(schema);

  if (typeName === "object") {
    const shape = getObjectShape(schema);
    if (!shape) return results;

    for (const [key, value] of Object.entries(shape)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      if (EXCLUDED_FIELD_REGISTRY_PATHS.has(currentPath)) {
        continue;
      }
      const valueType = getZodTypeName(value);
      const structuralValue = valueType === "nullable" ? value : unwrapType(value);
      const structuralType = getZodTypeName(structuralValue);
      const unionObject = structuralType === "union" ? getUnionObjectOption(structuralValue) : undefined;

      if (isCompoundField(currentPath)) {
        results.push({
          path: currentPath,
          type: mapToFieldType(value, currentPath),
          default: null,
          isNullable: false,
          isArray: false,
        });
        continue;
      }

      if (structuralType === "array") {
        const element = getArrayElement(structuralValue);
        if (element && getZodTypeName(element) === "object") {
          if (isExpandableArrayPath(currentPath)) {
            extractFieldPaths(element, `${currentPath}[]`, results);
          } else {
            results.push({
              path: currentPath,
              type:
                currentPath === "references"
                  ? "reference"
                  : currentPath === "citations" || currentPath === "source_citations"
                    ? "citation"
                    : "object",
              default: [],
              isNullable: false,
              isArray: true,
            });
          }
        } else {
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

      if (structuralType === "object") {
        const innerShape = getObjectShape(structuralValue);
        if (innerShape) {
          extractFieldPaths(structuralValue, currentPath, results);
          continue;
        }
      }

      if (unionObject) {
        extractFieldPaths(unionObject, currentPath, results);
        continue;
      }

      if (structuralType === "record") {
        results.push({
          path: currentPath,
          type: "object",
          default: {},
          isNullable: false,
          isArray: false,
        });
        continue;
      }

      if (structuralType === "nullable") {
        const inner = unwrapType(structuralValue);
        if (getZodTypeName(inner) === "object") {
          const innerShape = getObjectShape(inner);
          if (innerShape) {
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

export function inferFieldRegistrySection(
  pathValue: string,
): FieldRegistrySection {
  const firstSegment = pathValue.split(".")[0].replace(/\[\]/g, "");
  return FIELD_REGISTRY_SECTION_BY_ROOT[firstSegment] ?? "meta";
}
