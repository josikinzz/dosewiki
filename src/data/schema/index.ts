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


// Field Registry
export { getFieldRegistryDiagnostics } from "./fieldRegistry";

// Section Registry
export { getSectionRegistryDiagnostics } from "./sectionRegistry";


// Default factories
export { createEmptyDosageRoute, createEmptyDurationRoute } from "./defaultFactories";

// Transformers
export {
  doseRangeTransformer,
  durationStageTransformer,
} from "./transformers";


// Path Utilities
export { createEmptyArticle } from "./pathUtils";
