import type { FieldPathDiagnostic } from "./fieldPath";
import { REGISTRY_COMPOSITION_DIAGNOSTICS } from "./registryComposition";

export function getSectionRegistryDiagnostics(): FieldPathDiagnostic[] {
  return REGISTRY_COMPOSITION_DIAGNOSTICS.fieldPathDiagnostics.filter(
    (diagnostic) => diagnostic.operation === "section"
  );
}
