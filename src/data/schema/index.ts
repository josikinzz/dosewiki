/**
 * Centralized Schema Registry
 *
 * This module provides a single source of truth for the SubstanceArticle schema,
 * driving Dev Tools forms automatically and enabling maintainable schema changes.
 *
 * Usage:
 * ```typescript
 * import {
 *   FIELD_REGISTRY,
 *   SECTION_REGISTRY,
 *   getValueByPath,
 *   setValueByPath,
 *   hydrateFormFromArticle,
 *   buildArticleFromForm,
 *   doseRangeTransformer,
 * } from "@/data/schema";
 * ```
 */

// Types
export type {
  FieldType,
  SectionKey,
  Transformer,
  FieldMeta,
  SectionMeta,
  DoseRange,
  DurationStage,
  Citation,
  Reference,
  FormState,
  FieldError,
  ValidationResult,
} from "./types";

// Field Registry
export {
  FIELD_REGISTRY,
  getFieldMeta,
  getFieldRegistryDiagnostics,
  getFieldsForSection,
  getRouteDependentFields,
  getRequiredFields,
  getKnownFieldPaths,
} from "./fieldRegistry";

// Section Registry
export {
  SECTION_REGISTRY,
  getSectionMeta,
  getSectionKeys,
  getRouteDependentSections,
  getDefaultCollapsedSections,
  getSectionRegistryDiagnostics,
} from "./sectionRegistry";

// Registry Composition
export {
  REGISTRY_COMPOSITION,
  SECTION_FIELD_GROUPS,
  UNMATCHED_GENERATED_FIELD_PATHS,
  OVERRIDE_ONLY_FIELD_PATHS,
  SECTION_FIELDS_MISSING_FROM_REGISTRY,
  ROUTE_DEPENDENT_FIELDS,
  ROUTE_DEPENDENT_SECTIONS,
  REGISTRY_COMPOSITION_DIAGNOSTICS,
  composeRegistry,
} from "./registryComposition";

export type { ComposedRegistry, RegistryCompositionDiagnostics } from "./registryComposition";

// Default factories
export {
  createEmptyDosageRoute,
  createEmptyDoseRange,
  createEmptyDoseRanges,
  createEmptyDurationRoute,
  createEmptyDurationStage,
  createEmptyDurationStages,
} from "./defaultFactories";

// Transformers
export {
  doseRangeTransformer,
  durationStageTransformer,
  arrayTransformer,
  semicolonArrayTransformer,
  citationTransformer,
  numberTransformer,
  identityTransformer,
  recordTransformer,
  countryLegalityTransformer,
} from "./transformers";

export type { CountryLegality } from "../../schema";

// Field path contract
export {
  parseFieldPath,
  isFieldPathDiagnostic,
  formatFieldPath,
  normalizeFieldPath,
  isTemplateFieldPath,
  isIndexedFieldPath,
  templatePathToIndexedPath,
  routeTemplatePathToConcretePath,
  routeTemplatePathToRouteRelativePath,
  validateFieldPath,
  getArticleValueByPath,
  setArticleValueByPath,
  getSubstanceArticleValue,
  setSubstanceArticleValue,
} from "./fieldPath";

export type {
  FieldPathOperation,
  FieldPathSegment,
  ParsedFieldPath,
  FieldPathDiagnostic,
  FieldPathValidationOptions,
} from "./fieldPath";

// Path Utilities
export {
  getValueByPath,
  setValueByPath,
  createEmptyArticle,
  hydrateFormFromArticle,
  buildArticleFromForm,
  validateFormState,
  getFormValue,
  setSchemaValue,
  getNonEmptyPaths,
  getDifferingPaths,
} from "./pathUtils";
