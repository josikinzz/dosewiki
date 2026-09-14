import type { FieldPathDiagnostic } from "./fieldPath";
import { REGISTRY_COMPOSITION_DIAGNOSTICS } from "./registryComposition";



/**
 * Validate section field lists against the field path contract and merged registry.
 */
export function getSectionRegistryDiagnostics(): FieldPathDiagnostic[] {
  return REGISTRY_COMPOSITION_DIAGNOSTICS.fieldPathDiagnostics.filter(
    (diagnostic) => diagnostic.operation === "section"
  );
}
