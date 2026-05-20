import type { SectionMeta, SectionKey } from "./types";
import type { FieldPathDiagnostic } from "./fieldPath";
import {
  REGISTRY_COMPOSITION_DIAGNOSTICS,
  ROUTE_DEPENDENT_SECTIONS,
  SECTION_REGISTRY,
} from "./registryComposition";

export { SECTION_REGISTRY };

/**
 * Get section metadata by key
 */
export function getSectionMeta(key: SectionKey): SectionMeta | undefined {
  return SECTION_REGISTRY.find((section) => section.key === key);
}

/**
 * Get all section keys in display order
 */
export function getSectionKeys(): SectionKey[] {
  return SECTION_REGISTRY.map((section) => section.key);
}

/**
 * Get route-dependent sections
 */
export function getRouteDependentSections(): SectionMeta[] {
  return ROUTE_DEPENDENT_SECTIONS;
}

/**
 * Get sections that should be collapsed by default
 */
export function getDefaultCollapsedSections(): SectionKey[] {
  return SECTION_REGISTRY.filter((section) => section.defaultCollapsed).map((section) => section.key);
}

/**
 * Validate section field lists against the field path contract and merged registry.
 */
export function getSectionRegistryDiagnostics(): FieldPathDiagnostic[] {
  return REGISTRY_COMPOSITION_DIAGNOSTICS.fieldPathDiagnostics.filter(
    (diagnostic) => diagnostic.operation === "section"
  );
}
