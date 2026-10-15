import type { FieldMeta } from "./types";
import {
  FIELD_REGISTRY,
  KNOWN_FIELD_PATHS,
  REGISTRY_COMPOSITION_DIAGNOSTICS,
  ROUTE_DEPENDENT_FIELDS,
} from "./registryComposition";
import type { FieldPathDiagnostic } from "./fieldPath";

export { FIELD_REGISTRY };

export function getFieldMeta(path: string): FieldMeta | undefined {
  return FIELD_REGISTRY[path];
}

export function getFieldRegistryDiagnostics(): FieldPathDiagnostic[] {
  return REGISTRY_COMPOSITION_DIAGNOSTICS.fieldPathDiagnostics.filter(
    (diagnostic) => diagnostic.operation === "registry" || diagnostic.operation === "override"
  );
}

export function getFieldsForSection(sectionKey: string): FieldMeta[] {
  return Object.values(FIELD_REGISTRY).filter((field) => field.section === sectionKey);
}

export function getRouteDependentFields(): FieldMeta[] {
  return ROUTE_DEPENDENT_FIELDS;
}

export function getRequiredFields(): FieldMeta[] {
  return Object.values(FIELD_REGISTRY).filter((field) => field.required);
}

export function getKnownFieldPaths(): ReadonlySet<string> {
  return KNOWN_FIELD_PATHS;
}
