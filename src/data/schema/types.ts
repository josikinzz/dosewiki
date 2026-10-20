import type { IconName } from "@/components/common/Icon";

export type { DoseRange, DurationStage, Citation, Reference } from "../../schema";

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

export interface Transformer<TSchema = unknown, TForm = string> {
  toForm: (schemaValue: TSchema) => TForm;
  toSchema: (formValue: TForm) => TSchema;
}

export interface FieldMeta {
  path: string;
  label: string;
  type: FieldType;
  required: boolean;
  default: unknown;
  placeholder?: string;
  description?: string;
  section: SectionKey;
  routeDependent?: boolean;
  transformer?: Transformer;
}

export interface SectionMeta {
  key: SectionKey;
  label: string;
  icon: IconName;
  description?: string;
  fields: string[];
  routeDependent?: boolean;
  defaultCollapsed?: boolean;
}
