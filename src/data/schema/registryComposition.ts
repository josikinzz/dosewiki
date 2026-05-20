import type { FieldMeta, SectionKey, SectionMeta } from "./types";
import { GENERATED_FIELD_REGISTRY, type GeneratedFieldMeta } from "./fieldRegistry.generated";
import { FIELD_OVERRIDES } from "./fieldOverrides";
import type { FieldOverrideModule } from "./fieldOverrides/shared";
import { validateFieldPath, type FieldPathDiagnostic } from "./fieldPath";

export interface RegistryCompositionDiagnostics {
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

const SECTION_PRESENTATION_REGISTRY: SectionMeta[] = [
  {
    key: "meta",
    label: "Meta",
    icon: "lucide:settings",
    description: "Article metadata and categorization",
    fields: ["id", "title", "index_categories", "summary"],
    defaultCollapsed: false,
  },
  {
    key: "identification",
    label: "Identification",
    icon: "lucide:file-text",
    description: "Chemical identification and nomenclature",
    fields: [
      "identification.common_name",
      "identification.substitutive_name",
      "identification.iupac_name",
      "identification.alternative_names",
      "identification.smiles",
      "identification.inchi_key",
      "identification.cas_number",
      "identification.molecular_formula",
      "identification.molecular_weight",
      "identification.skeletal_structure_image",
      "reagent_testing",
    ],
    defaultCollapsed: false,
  },
  {
    key: "classification",
    label: "Classification",
    icon: "lucide:tags",
    description: "Psychoactive and chemical classifications",
    fields: ["classification.psychoactive_class", "classification.chemical_class"],
    defaultCollapsed: false,
  },
  {
    key: "dosage",
    label: "Dosage",
    icon: "lucide:pill",
    description: "Dosage information by route of administration",
    routeDependent: true,
    fields: [
      "dosage.routes[].route",
      "dosage.routes[].bioavailability",
      "dosage.routes[].dose_ranges.threshold",
      "dosage.routes[].dose_ranges.light",
      "dosage.routes[].dose_ranges.moderate",
      "dosage.routes[].dose_ranges.strong",
      "dosage.routes[].dose_ranges.heavy",
      "dosage.routes[].notes",
      "dosage.routes[].reference_ids",
    ],
    defaultCollapsed: false,
  },
  {
    key: "duration",
    label: "Duration",
    icon: "lucide:clock",
    description: "Duration stages by route of administration",
    routeDependent: true,
    fields: [
      "duration.routes[].route",
      "duration.routes[].stages.onset",
      "duration.routes[].stages.come_up",
      "duration.routes[].stages.peak",
      "duration.routes[].stages.offset",
      "duration.routes[].stages.after_effects",
      "duration.routes[].stages.total_duration",
      "duration.routes[].reference_ids",
    ],
    defaultCollapsed: false,
  },
  {
    key: "subjective_effects",
    label: "Subjective Effects",
    icon: "lucide:brain",
    description: "Reported subjective effects and experiences",
    fields: [
      "subjective_effects.notes.overview",
      "subjective_effects.notes.sensory",
      "subjective_effects.notes.cognitive",
      "subjective_effects.notes.physical",
      "subjective_effects.sensory.visual",
      "subjective_effects.sensory.auditory",
      "subjective_effects.sensory.tactile",
      "subjective_effects.sensory.olfactory",
      "subjective_effects.sensory.gustatory",
      "subjective_effects.sensory.multisensory",
      "subjective_effects.cognitive",
      "subjective_effects.physical",
      "comparisons",
    ],
    defaultCollapsed: true,
  },
  {
    key: "pharmacology",
    label: "Pharmacology",
    icon: "lucide:beaker",
    description: "Pharmacological properties and mechanisms",
    fields: [
      "pharmacology.pharmacodynamics",
      "pharmacology.receptor_profile",
      "pharmacology.pharmacokinetics",
      "pharmacology.metabolites",
    ],
    defaultCollapsed: true,
  },
  {
    key: "interactions",
    label: "Interactions",
    icon: "lucide:alert-triangle",
    description: "Drug interaction warnings",
    fields: ["interactions.dangerous", "interactions.unsafe", "interactions.caution"],
    defaultCollapsed: false,
  },
  {
    key: "tolerance",
    label: "Tolerance",
    icon: "lucide:timer",
    description: "Tolerance development and cross-tolerance",
    fields: [
      "tolerance.full_tolerance",
      "tolerance.half_tolerance",
      "tolerance.baseline_tolerance",
      "tolerance.cross_tolerance",
    ],
    defaultCollapsed: true,
  },
  {
    key: "harm_potential",
    label: "Harm Potential",
    icon: "lucide:shield-alert",
    description: "Addiction, toxicity, and health risks",
    fields: [
      "harm_potential.addiction_liability",
      "harm_potential.dependence_liability",
      "harm_potential.toxicity.ld50",
      "harm_potential.toxicity.organ_toxicity",
      "harm_potential.toxicity.carcinogenicity",
      "harm_potential.toxicity.other",
      "harm_potential.risks.psychosis",
      "harm_potential.risks.self_harm",
      "harm_potential.risks.seizure",
      "harm_potential.risks.other",
    ],
    defaultCollapsed: true,
  },
  {
    key: "legality",
    label: "Legality",
    icon: "lucide:scale",
    description: "Legal status by jurisdiction",
    fields: ["legality.international", "legality.countries"],
    defaultCollapsed: true,
  },
  {
    key: "citations",
    label: "References",
    icon: "lucide:book-open",
    description: "Structured references first, with legacy compatibility link lists demoted below them.",
    fields: ["references", "source_citations", "citations"],
    defaultCollapsed: true,
  },
];

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
