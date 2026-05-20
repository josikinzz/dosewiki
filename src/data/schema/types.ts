import type { IconName } from "@/components/common/Icon";

// Re-export types from central schema (single source of truth)
export type { DoseRange, DurationStage, Citation, Reference } from "../../schema";

/**
 * Core types for the schema registry system.
 * These types define the structure for field metadata, section groupings,
 * and value transformers that drive the Dev Tools forms automatically.
 */

/** Field types for rendering appropriate input components */
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "array"
  | "tagArray"
  | "dose"
  | "duration"
  | "object"
  | "citation"
  | "reference";

/** Section keys for UI groupings */
export type SectionKey =
  | "identification"
  | "classification"
  | "dosage"
  | "duration"
  | "subjective_effects"
  | "pharmacology"
  | "interactions"
  | "tolerance"
  | "harm_potential"
  | "legality"
  | "citations"
  | "meta";

/** Value transformer for converting between schema objects and form strings */
export interface Transformer<TSchema = unknown, TForm = string> {
  /** Convert schema value to form display value */
  toForm: (schemaValue: TSchema) => TForm;
  /** Convert form value back to schema value */
  toSchema: (formValue: TForm) => TSchema;
}

/** Field metadata for each schema path */
export interface FieldMeta {
  /** Dot-notation path in the schema (e.g., "identification.common_name") */
  path: string;
  /** Human-readable label for the field */
  label: string;
  /** Field type determines which input component to render */
  type: FieldType;
  /** Whether the field is required for validation */
  required: boolean;
  /** Default value when creating new articles */
  default: unknown;
  /** Placeholder text for input fields */
  placeholder?: string;
  /** Help text or description for the field */
  description?: string;
  /** Which UI section this field belongs to */
  section: SectionKey;
  /** Whether this field is route-dependent (dosage/duration) */
  routeDependent?: boolean;
  /** Transformer for converting between form and schema values */
  transformer?: Transformer;
}

/** UI section grouping metadata */
export interface SectionMeta {
  /** Unique key for the section */
  key: SectionKey;
  /** Human-readable section title */
  label: string;
  /** Icon component for the section header */
  icon: IconName;
  /** Optional description for the section */
  description?: string;
  /** Field paths in display order */
  fields: string[];
  /** Whether this section contains route-dependent fields */
  routeDependent?: boolean;
  /** Whether this section should be collapsed by default */
  defaultCollapsed?: boolean;
}

/** Form state type - maps field paths to their form values */
export type FormState = Record<string, unknown>;

/** Validation error for a specific field */
export interface FieldError {
  path: string;
  message: string;
}

/** Validation result for the entire form */
export interface ValidationResult {
  valid: boolean;
  errors: FieldError[];
}
