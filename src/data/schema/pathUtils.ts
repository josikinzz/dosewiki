import type { SubstanceArticle } from "../../schema";
import type { FormState, ValidationResult, FieldError } from "./types";
import { FIELD_REGISTRY, getRequiredFields } from "./fieldRegistry";
import { createEmptyArticle } from "./defaults.generated";
import {
  getArticleValueByPath,
  setArticleValueByPath,
} from "./fieldPath";

export { createEmptyArticle };

export function getValueByPath(obj: unknown, path: string): unknown {
  return getArticleValueByPath(obj, path);
}

export function setValueByPath<T>(obj: T, path: string, value: unknown): T {
  return setArticleValueByPath(obj, path, value);
}

export function hydrateFormFromArticle(article: SubstanceArticle): FormState {
  const state: FormState = {};

  for (const [path, meta] of Object.entries(FIELD_REGISTRY)) {
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

export function buildArticleFromForm(
  state: FormState,
  baseArticle?: SubstanceArticle
): SubstanceArticle {
  let article = baseArticle ? structuredClone(baseArticle) : createEmptyArticle();

  for (const [path, meta] of Object.entries(FIELD_REGISTRY)) {
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
