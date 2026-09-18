import type { FieldMeta, SectionKey, SectionMeta } from "./types";
import { GENERATED_FIELD_REGISTRY, type GeneratedFieldMeta } from "./fieldRegistry.generated";
import { FIELD_OVERRIDES } from "./fieldOverrides";
import type { FieldOverrideModule } from "./fieldOverrides/shared";
import { validateFieldPath, type FieldPathDiagnostic } from "./fieldPath";
import { getCatalogSchemaSections } from "../../schema/substance/sectionCatalog";

interface RegistryCompositionDiagnostics {
  fieldPathDiagnostics: FieldPathDiagnostic[];
  unmatchedGeneratedPaths: string[];
  overrideOnlyPaths: string[];
  sectionFieldsMissingFromRegistry: Array<{ section: SectionKey; path: string }>;
}

export interface ComposedRegistry {
  fieldRegistry: Record<string, FieldMeta>;
  sectionRegistry: SectionMeta[];
  sectionFieldGroups: Array<{ section: SectionMeta; fields: FieldMeta[] }>;
  unmatchedGeneratedPaths: string[];
  overrideOnlyPaths: string[];
  sectionFieldsMissingFromRegistry: Array<{ section: SectionKey; path: string }>;
  routeDependentFields: FieldMeta[];
  routeDependentSections: SectionMeta[];
  diagnostics: RegistryCompositionDiagnostics;
  knownFieldPaths: ReadonlySet<string>;
}

const SECTION_PRESENTATION_REGISTRY: SectionMeta[] = getCatalogSchemaSections();

export function composeRegistry(
  generatedRegistry: Record<string, GeneratedFieldMeta> = GENERATED_FIELD_REGISTRY,
  overrides: FieldOverrideModule = FIELD_OVERRIDES,
  sectionRegistry: SectionMeta[] = SECTION_PRESENTATION_REGISTRY
): ComposedRegistry {
  const fieldRegistry = buildFieldRegistry(generatedRegistry, overrides);
  const generatedPaths = Object.keys(generatedRegistry);
  const overridePaths = Object.keys(overrides);
  const knownGeneratedPaths = new Set(generatedPaths);
  const knownFieldPaths = new Set(Object.keys(fieldRegistry));
  const sectionFieldsMissingFromRegistry = sectionRegistry.flatMap((section) =>
    section.fields
      .filter((path) => !knownFieldPaths.has(path))
      .map((path) => ({ section: section.key, path }))
  );
  const sectionFieldGroups = sectionRegistry.map((section) => ({
    section,
    fields: section.fields.flatMap((path) => {
      const field = fieldRegistry[path];
      return field ? [field] : [];
    }),
  }));
  const unmatchedGeneratedPaths = generatedPaths.filter(
    (path) => !sectionRegistry.some((section) => section.fields.includes(path))
  );
  const overrideOnlyPaths = overridePaths.filter((path) => !knownGeneratedPaths.has(path));
  const routeDependentFields = Object.values(fieldRegistry).filter((field) => field.routeDependent);
  const routeDependentSections = sectionRegistry.filter(
    (section) => section.routeDependent || section.fields.some((path) => fieldRegistry[path]?.routeDependent)
  );
  const fieldPathDiagnostics = [
    ...generatedPaths.flatMap((path) =>
      validateFieldPath(path, { operation: "registry", knownRegistryPaths: knownGeneratedPaths })
    ),
    ...overridePaths.flatMap((path) =>
      validateFieldPath(path, {
        operation: "override",
        knownRegistryPaths: knownGeneratedPaths,
        allowUnknownOverridePaths: true,
      })
    ),
    ...sectionRegistry.flatMap((section) =>
      section.fields.flatMap((path) =>
        validateFieldPath(path, { operation: "section", knownRegistryPaths: knownFieldPaths })
      )
    ),
  ];

  return {
    fieldRegistry,
    sectionRegistry,
    sectionFieldGroups,
    unmatchedGeneratedPaths,
    overrideOnlyPaths,
    sectionFieldsMissingFromRegistry,
    routeDependentFields,
    routeDependentSections,
    diagnostics: {
      fieldPathDiagnostics,
      unmatchedGeneratedPaths,
      overrideOnlyPaths,
      sectionFieldsMissingFromRegistry,
    },
    knownFieldPaths,
  };
}

function buildFieldRegistry(
  generatedRegistry: Record<string, GeneratedFieldMeta>,
  overrides: FieldOverrideModule
): Record<string, FieldMeta> {
  const registry: Record<string, FieldMeta> = {};

  for (const [path, generated] of Object.entries(generatedRegistry)) {
    registry[path] = composeFieldMeta(path, generated, overrides[path]);
  }

  for (const [path, override] of Object.entries(overrides)) {
    if (!registry[path]) {
      registry[path] = composeFieldMeta(path, undefined, override);
    }
  }

  return registry;
}

function composeFieldMeta(
  path: string,
  generated: GeneratedFieldMeta | undefined,
  override: FieldOverrideModule[string] | undefined
): FieldMeta {
  return {
    path,
    label: override?.label ?? humanizeFieldPath(path),
    type: override?.type ?? (generated?.type as FieldMeta["type"] | undefined) ?? "text",
    required: override?.required ?? false,
    default: override?.default ?? generated?.default ?? "",
    section: override?.section ?? inferSection(path),
    transformer: override?.transformer,
    placeholder: override?.placeholder,
    description: override?.description,
    routeDependent: override?.routeDependent,
  };
}

function humanizeFieldPath(path: string): string {
  const segments = path.replace(/\[\]/g, "").split(".");
  const lastSegment = segments[segments.length - 1];

  return lastSegment
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferSection(path: string): FieldMeta["section"] {
  const segments = path.split(".");
  const firstSegment = segments[0].replace(/\[\]/g, "");
  const sectionMap: Record<string, FieldMeta["section"]> = {
    id: "meta",
    title: "meta",
    index_categories: "meta",
    summary: "meta",
    identification: "identification",
    classification: "classification",
    dosage: "dosage",
    duration: "duration",
    subjective_effects: "subjective_effects",
    comparisons: "subjective_effects",
    pharmacology: "pharmacology",
    interactions: "interactions",
    reagent_testing: "identification",
    tolerance: "tolerance",
    harm_potential: "harm_potential",
    legality: "legality",
    citations: "citations",
  };

  return sectionMap[firstSegment] ?? "meta";
}

export const REGISTRY_COMPOSITION = composeRegistry();

export const FIELD_REGISTRY = REGISTRY_COMPOSITION.fieldRegistry;
export const SECTION_REGISTRY = REGISTRY_COMPOSITION.sectionRegistry;
export const SECTION_FIELD_GROUPS = REGISTRY_COMPOSITION.sectionFieldGroups;
export const UNMATCHED_GENERATED_FIELD_PATHS = REGISTRY_COMPOSITION.unmatchedGeneratedPaths;
export const OVERRIDE_ONLY_FIELD_PATHS = REGISTRY_COMPOSITION.overrideOnlyPaths;
export const SECTION_FIELDS_MISSING_FROM_REGISTRY = REGISTRY_COMPOSITION.sectionFieldsMissingFromRegistry;
export const ROUTE_DEPENDENT_FIELDS = REGISTRY_COMPOSITION.routeDependentFields;
export const ROUTE_DEPENDENT_SECTIONS = REGISTRY_COMPOSITION.routeDependentSections;
export const REGISTRY_COMPOSITION_DIAGNOSTICS = REGISTRY_COMPOSITION.diagnostics;
export const KNOWN_FIELD_PATHS = REGISTRY_COMPOSITION.knownFieldPaths;
