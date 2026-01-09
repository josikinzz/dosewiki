import type { SubstanceArticle } from "../../schema";
import type { FormState, ValidationResult, FieldError } from "./types";
import { FIELD_REGISTRY, getRequiredFields } from "./fieldRegistry";
import { createEmptyArticle } from "./defaults.generated";

// Re-export createEmptyArticle for backward compatibility
export { createEmptyArticle };

/**
 * Path-based utilities for getting and setting values in nested objects.
 * These enable the schema registry to work with any SubstanceArticle field.
 */

/**
 * Get a value from a nested object using dot-notation path.
 * Supports array notation like "dosage.routes[0].route"
 *
 * @param obj - The object to read from
 * @param path - Dot-notation path (e.g., "identification.common_name")
 * @returns The value at the path, or undefined if not found
 */
export function getValueByPath(obj: unknown, path: string): unknown {
  if (obj == null || typeof path !== "string" || !path) {
    return undefined;
  }

  // Remove array template notation [] and split by dots
  const cleanPath = path.replace(/\[\]/g, "");
  const segments = cleanPath.split(".");

  let current: unknown = obj;

  for (const segment of segments) {
    if (current == null) {
      return undefined;
    }

    // Handle array index notation like [0]
    const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      const arr = (current as Record<string, unknown>)[key];
      if (!Array.isArray(arr) || index < 0 || index >= arr.length) {
        return undefined;
      }
      current = arr[index];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}

/**
 * Set a value in a nested object using dot-notation path.
 * Returns a new object (immutable operation).
 *
 * @param obj - The object to clone and modify
 * @param path - Dot-notation path (e.g., "identification.common_name")
 * @param value - The value to set
 * @returns A new object with the value set
 */
export function setValueByPath<T>(obj: T, path: string, value: unknown): T {
  if (typeof path !== "string" || !path) {
    return obj;
  }

  // Remove array template notation [] and split by dots
  const cleanPath = path.replace(/\[\]/g, "");
  const segments = cleanPath.split(".");

  // Deep clone the object
  const result = structuredClone(obj) as Record<string, unknown>;

  let current: Record<string, unknown> = result;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];

    // Handle array index notation
    const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);

      if (!Array.isArray(current[key])) {
        current[key] = [];
      }
      const arr = current[key] as unknown[];
      while (arr.length <= index) {
        arr.push({});
      }
      if (typeof arr[index] !== "object" || arr[index] === null) {
        arr[index] = {};
      }
      current = arr[index] as Record<string, unknown>;
    } else {
      if (current[segment] == null || typeof current[segment] !== "object") {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }
  }

  const lastSegment = segments[segments.length - 1];

  // Handle array index in last segment
  const lastArrayMatch = lastSegment.match(/^(\w+)\[(\d+)\]$/);
  if (lastArrayMatch) {
    const [, key, indexStr] = lastArrayMatch;
    const index = parseInt(indexStr, 10);
    if (!Array.isArray(current[key])) {
      current[key] = [];
    }
    (current[key] as unknown[])[index] = value;
  } else {
    current[lastSegment] = value;
  }

  return result as T;
}

/**
 * Hydrate form state from a SubstanceArticle using the field registry.
 * Converts schema values to form-friendly values using transformers.
 *
 * @param article - The SubstanceArticle to read from
 * @returns FormState with transformed values
 */
export function hydrateFormFromArticle(article: SubstanceArticle): FormState {
  const state: FormState = {};

  for (const [path, meta] of Object.entries(FIELD_REGISTRY)) {
    // Skip route-dependent fields (handled separately)
    if (meta.routeDependent) {
      continue;
    }

    const schemaValue = getValueByPath(article, path);

    if (meta.transformer) {
      state[path] = meta.transformer.toForm(schemaValue);
    } else {
      state[path] = schemaValue ?? meta.default;
    }
  }

  return state;
}

/**
 * Build a SubstanceArticle from form state using the field registry.
 * Converts form values back to schema values using transformers.
 *
 * @param state - The form state to convert
 * @param baseArticle - Optional base article to merge with
 * @returns SubstanceArticle with schema values
 */
export function buildArticleFromForm(
  state: FormState,
  baseArticle?: SubstanceArticle
): SubstanceArticle {
  let article = baseArticle ? structuredClone(baseArticle) : createEmptyArticle();

  for (const [path, meta] of Object.entries(FIELD_REGISTRY)) {
    // Skip route-dependent fields (handled separately)
    if (meta.routeDependent) {
      continue;
    }

    const formValue = state[path];

    if (formValue === undefined) {
      continue;
    }

    let schemaValue: unknown;
    if (meta.transformer) {
      schemaValue = meta.transformer.toSchema(formValue as string);
    } else {
      schemaValue = formValue;
    }

    article = setValueByPath(article, path, schemaValue);
  }

  return article;
}

/**
 * Validate form state against the field registry.
 *
 * @param state - The form state to validate
 * @returns ValidationResult with any errors
 */
export function validateFormState(state: FormState): ValidationResult {
  const errors: FieldError[] = [];
  const requiredFields = getRequiredFields();

  for (const field of requiredFields) {
    const value = state[field.path];

    const isEmpty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      errors.push({
        path: field.path,
        message: `${field.label} is required`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get form value for a specific field, applying transformer if needed.
 */
export function getFormValue(article: SubstanceArticle, path: string): unknown {
  const meta = FIELD_REGISTRY[path];
  if (!meta) {
    return getValueByPath(article, path);
  }

  const schemaValue = getValueByPath(article, path);

  if (meta.transformer) {
    return meta.transformer.toForm(schemaValue);
  }

  return schemaValue ?? meta.default;
}

/**
 * Set a form value back to schema format.
 */
export function setSchemaValue(
  article: SubstanceArticle,
  path: string,
  formValue: unknown
): SubstanceArticle {
  const meta = FIELD_REGISTRY[path];

  let schemaValue: unknown;
  if (meta?.transformer) {
    schemaValue = meta.transformer.toSchema(formValue as string);
  } else {
    schemaValue = formValue;
  }

  return setValueByPath(article, path, schemaValue);
}

/**
 * Get all paths that have non-empty values in an article.
 */
export function getNonEmptyPaths(article: SubstanceArticle): string[] {
  const paths: string[] = [];

  for (const path of Object.keys(FIELD_REGISTRY)) {
    const value = getValueByPath(article, path);

    const isEmpty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);

    if (!isEmpty) {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Compare two articles and return paths that differ.
 */
export function getDifferingPaths(
  articleA: SubstanceArticle,
  articleB: SubstanceArticle
): string[] {
  const differing: string[] = [];

  for (const path of Object.keys(FIELD_REGISTRY)) {
    const valueA = getValueByPath(articleA, path);
    const valueB = getValueByPath(articleB, path);

    if (JSON.stringify(valueA) !== JSON.stringify(valueB)) {
      differing.push(path);
    }
  }

  return differing;
}
