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
  FormState,
  FieldError,
  ValidationResult,
} from "./types";

// Field Registry
export {
  FIELD_REGISTRY,
  getFieldMeta,
  getFieldsForSection,
  getRouteDependentFields,
  getRequiredFields,
} from "./fieldRegistry";

// Section Registry
export {
  SECTION_REGISTRY,
  getSectionMeta,
  getSectionKeys,
  getRouteDependentSections,
  getDefaultCollapsedSections,
} from "./sectionRegistry";

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
