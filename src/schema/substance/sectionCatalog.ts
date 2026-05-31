import type { IconName } from "@/components/common/Icon";
import type { SectionMeta as SchemaSectionMeta } from "@/data/schema/types";
import { hasProjectedSubstanceCitations } from "@/lib/citations/substanceCitationCompatibility";
import { hasPharmacologyContent } from "../../../lib/article/normalization.js";
import type { QuoteSectionId } from "../../../lib/quoteSections.js";
import type { SubstanceArticle } from "./article";

export type SubstanceArticleFieldKey = keyof SubstanceArticle;

export type SubstanceSectionId =
  | "overview"
  | "classification"
  | "summary"
  | "dosage-duration"
  | "subjective-effects"
  | "reagent-testing"
  | "pharmacology"
  | "interactions"
  | "tolerance"
  | "harm-potential"
  | "history-culture"
  | "legality"
  | "sources"
  | "citations"
  | "editorial-review";

export type SubstancePublicRendererAdapter =
  | "HeroSection"
  | "DosageDurationSection"
  | "SubjectiveEffectsSection"
  | "ReagentSection"
  | "PharmacologySection"
  | "InteractionsSection"
  | "ToleranceSection"
  | "HarmPotentialSection"
  | "HistoryCultureSection"
  | "LegalitySection"
  | "CitationsSection";

export type SubstanceEditorFormAdapter =
  | "OverviewFieldsRHF"
  | "ClassificationFieldsRHF"
  | "NotesFieldsRHF"
  | "DosageDurationFieldsRHF"
  | "SubjectiveEffectsFieldsRHF"
  | "ReagentPreviewFieldsRHF"
  | "ChemistryFieldsRHF"
  | "InteractionsFieldsRHF"
  | "ToleranceFieldsRHF"
  | "AddictionFieldsRHF"
  | "HistoryCultureFieldsRHF"
  | "LegalityFieldsRHF"
  | "SourceCitationsFieldsRHF"
  | "CitationsFieldsRHF"
  | "EditorialReviewFieldsRHF";

export interface SubstanceSectionPresenceContext {
  hasExternalReagentData?: boolean;
  isLoadingExternalReagentData?: boolean;
}

export interface SubstanceSectionManifestEntry {
  id: SubstanceSectionId;
  label: string;
  icon: IconName;
  articleFields: SubstanceArticleFieldKey[];
  editor: {
    visible: boolean;
    adapter?: SubstanceEditorFormAdapter;
    order?: number;
    editorOnly?: boolean;
  };
  public: {
    visible: boolean;
    toc: boolean;
    renderer?: SubstancePublicRendererAdapter;
    isPresent?: (
      article: SubstanceArticle,
      context?: SubstanceSectionPresenceContext,
    ) => boolean;
  };
  generator?: {
    promptKey: string;
    quoteSection: QuoteSectionId | null;
    batchUpdate: boolean;
    prepopulateUpdate: boolean;
  };
}

interface CatalogPromptMeta {
  sectionKey: string;
  label?: string;
  description: string;
  seedPath: string;
  sourceMaterial: "none" | "extracted";
  editorVisible: boolean;
}

interface SubstanceSectionCatalogEntry extends SubstanceSectionManifestEntry {
  prompt?: CatalogPromptMeta;
  schemaSections?: readonly SchemaSectionMeta[];
}

function hasStaticReagentData(article: SubstanceArticle): boolean {
  return Boolean(
    article.reagent_testing &&
      Object.values(article.reagent_testing).some((value) => value?.trim().length > 0),
  );
}

function hasSubjectiveEffectsContent(article: SubstanceArticle): boolean {
  const se = article.subjective_effects;
  if (!se) return false;

  const hasSensory =
    se.sensory &&
    Object.values(se.sensory).some(
      (sense) => sense?.subcategories && Object.keys(sense.subcategories).length > 0,
    );
  const hasCognitive = se.cognitive && Object.keys(se.cognitive).length > 0;
  const hasPhysical = se.physical && Object.keys(se.physical).length > 0;
  const hasProgressiveStages =
    se.progressive_stages && Object.keys(se.progressive_stages).length > 0;
  const hasOverview = se.notes?.overview?.trim().length > 0;
  const hasComparisons = (article.comparisons?.length ?? 0) > 0;

  return Boolean(
    hasSensory ||
      hasCognitive ||
      hasPhysical ||
      hasProgressiveStages ||
      hasOverview ||
      hasComparisons,
  );
}

export const ARTICLE_SECTION_CATALOG = [
  {
    id: "overview",
    label: "Overview",
    icon: "lucide:file-text",
    articleFields: ["title", "identification", "index_categories", "priority"],
    editor: { visible: true, adapter: "OverviewFieldsRHF", order: 1 },
    public: { visible: true, toc: false, renderer: "HeroSection" },
    schemaSections: [
      {
        key: "meta",
        label: "Meta",
        icon: "lucide:settings",
        description: "Article metadata and categorization",
        fields: ["id", "title", "index_categories", "summary"],
        defaultCollapsed: false,
      },
    ],
  },
  {
    id: "classification",
    label: "Classification",
    icon: "lucide:brain-cog",
    articleFields: ["classification", "identification"],
    editor: { visible: true, adapter: "ClassificationFieldsRHF", order: 2 },
    public: { visible: false, toc: false },
    generator: {
      promptKey: "identification",
      quoteSection: null,
      batchUpdate: false,
      prepopulateUpdate: false,
    },
    prompt: {
      sectionKey: "identification",
      label: "Identification & Classification",
      description: "Chemical names, SMILES, CAS numbers, and classification tags",
      seedPath: "src/data/config/sectionPrompts/identification.md",
      sourceMaterial: "none",
      editorVisible: true,
    },
    schemaSections: [
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
    ],
  },
  {
    id: "summary",
    label: "Summary",
    icon: "lucide:file-text",
    articleFields: ["summary"],
    editor: { visible: true, adapter: "NotesFieldsRHF", order: 3 },
    public: { visible: false, toc: false },
    generator: {
      promptKey: "summary",
      quoteSection: "summary",
      batchUpdate: true,
      prepopulateUpdate: false,
    },
    prompt: {
      sectionKey: "summary",
      description: "Brief overview paragraph introducing the substance",
      seedPath: "src/data/config/sectionPrompts/summary.md",
      sourceMaterial: "extracted",
      editorVisible: true,
    },
  },
  {
    id: "dosage-duration",
    label: "Dosage & Duration",
    icon: "lucide:chart-no-axes-combined",
    articleFields: ["dosage", "duration"],
    editor: { visible: true, adapter: "DosageDurationFieldsRHF", order: 4 },
    public: {
      visible: true,
      toc: true,
      renderer: "DosageDurationSection",
      isPresent: (article) =>
        article.dosage?.routes?.length > 0 || article.duration?.routes?.length > 0,
    },
    generator: {
      promptKey: "dosage_duration",
      quoteSection: "dosage_duration",
      batchUpdate: true,
      prepopulateUpdate: true,
    },
    prompt: {
      sectionKey: "dosage_duration",
      description: "Dose ranges by route and duration timelines",
      seedPath: "src/data/config/sectionPrompts/dosageDuration.md",
      sourceMaterial: "extracted",
      editorVisible: true,
    },
    schemaSections: [
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
    ],
  },
  {
    id: "subjective-effects",
    label: "Subjective Effects",
    icon: "lucide:sparkles",
    articleFields: ["subjective_effects", "comparisons"],
    editor: { visible: true, adapter: "SubjectiveEffectsFieldsRHF", order: 5 },
    public: {
      visible: true,
      toc: true,
      renderer: "SubjectiveEffectsSection",
      isPresent: hasSubjectiveEffectsContent,
    },
    generator: {
      promptKey: "subjective_effects",
      quoteSection: "subjective_effects",
      batchUpdate: false,
      prepopulateUpdate: false,
    },
    prompt: {
      sectionKey: "subjective_effects",
      description: "Sensory, cognitive, and physical effects",
      seedPath: "src/data/config/sectionPrompts/subjectiveEffects.md",
      sourceMaterial: "extracted",
      editorVisible: true,
    },
    schemaSections: [
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
    ],
  },
  {
    id: "reagent-testing",
    label: "Reagent Testing",
    icon: "lucide:pipette",
    articleFields: ["reagent_testing"],
    editor: { visible: true, adapter: "ReagentPreviewFieldsRHF", order: 6 },
    public: {
      visible: true,
      toc: true,
      renderer: "ReagentSection",
      isPresent: (article, context) =>
        hasStaticReagentData(article) ||
        Boolean(context?.hasExternalReagentData) ||
        Boolean(context?.isLoadingExternalReagentData),
    },
  },
  {
    id: "pharmacology",
    label: "Pharmacology",
    icon: "mingcute:settings-6-line",
    articleFields: ["pharmacology"],
    editor: { visible: true, adapter: "ChemistryFieldsRHF", order: 7 },
    public: {
      visible: true,
      toc: true,
      renderer: "PharmacologySection",
      isPresent: (article) => hasPharmacologyContent(article.pharmacology),
    },
    generator: {
      promptKey: "pharmacology",
      quoteSection: "pharmacology",
      batchUpdate: true,
      prepopulateUpdate: false,
    },
    prompt: {
      sectionKey: "pharmacology",
      description: "Mechanism of action, receptor binding, metabolism",
      seedPath: "src/data/config/sectionPrompts/pharmacology.md",
      sourceMaterial: "extracted",
      editorVisible: true,
    },
    schemaSections: [
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
    ],
  },
  {
    id: "interactions",
    label: "Interactions",
    icon: "lucide:blend",
    articleFields: ["interactions"],
    editor: { visible: true, adapter: "InteractionsFieldsRHF", order: 8 },
    public: {
      visible: true,
      toc: true,
      renderer: "InteractionsSection",
      isPresent: (article) => {
        const interactions = article.interactions;
        if (!interactions) return false;
        return (
          interactions.dangerous?.length > 0 ||
          interactions.unsafe?.length > 0 ||
          interactions.caution?.length > 0
        );
      },
    },
    generator: {
      promptKey: "interactions",
      quoteSection: null,
      batchUpdate: false,
      prepopulateUpdate: false,
    },
    prompt: {
      sectionKey: "interactions",
      description: "Dangerous, unsafe, and caution drug combinations",
      seedPath: "src/data/config/sectionPrompts/interactions.md",
      sourceMaterial: "none",
      editorVisible: true,
    },
    schemaSections: [
      {
        key: "interactions",
        label: "Interactions",
        icon: "lucide:alert-triangle",
        description: "Drug interaction warnings",
        fields: ["interactions.dangerous", "interactions.unsafe", "interactions.caution"],
        defaultCollapsed: false,
      },
    ],
  },
  {
    id: "tolerance",
    label: "Tolerance",
    icon: "lucide:trending-up",
    articleFields: ["tolerance"],
    editor: { visible: true, adapter: "ToleranceFieldsRHF", order: 9 },
    public: {
      visible: true,
      toc: true,
      renderer: "ToleranceSection",
      isPresent: (article) => {
        const tolerance = article.tolerance;
        if (!tolerance) return false;
        return (
          tolerance.full_tolerance?.trim().length > 0 ||
          tolerance.half_tolerance?.trim().length > 0 ||
          tolerance.baseline_tolerance?.trim().length > 0 ||
          tolerance.cross_tolerance?.length > 0
        );
      },
    },
    generator: {
      promptKey: "tolerance",
      quoteSection: "tolerance",
      batchUpdate: false,
      prepopulateUpdate: false,
    },
    prompt: {
      sectionKey: "tolerance",
      description: "Tolerance development and cross-tolerance",
      seedPath: "src/data/config/sectionPrompts/tolerance.md",
      sourceMaterial: "extracted",
      editorVisible: true,
    },
    schemaSections: [
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
    ],
  },
  {
    id: "harm-potential",
    label: "Harm Potential",
    icon: "lucide:ambulance",
    articleFields: ["harm_potential"],
    editor: { visible: true, adapter: "AddictionFieldsRHF", order: 10 },
    public: {
      visible: true,
      toc: true,
      renderer: "HarmPotentialSection",
      isPresent: (article) => {
        const harmPotential = article.harm_potential;
        if (!harmPotential) return false;
        return (
          harmPotential.addiction !== undefined ||
          harmPotential.toxicity !== undefined ||
          harmPotential.psychosis !== undefined ||
          harmPotential.seizure !== undefined
        );
      },
    },
    generator: {
      promptKey: "harm_potential",
      quoteSection: "harm_potential",
      batchUpdate: true,
      prepopulateUpdate: false,
    },
    prompt: {
      sectionKey: "harm_potential",
      description: "Addiction, toxicity, and health risks",
      seedPath: "src/data/config/sectionPrompts/harmPotential.md",
      sourceMaterial: "extracted",
      editorVisible: true,
    },
    schemaSections: [
      {
        key: "harm_potential",
        label: "Harm Potential",
        icon: "lucide:shield-alert",
        description: "Addiction, toxicity, and health risks",
        fields: [
          "harm_potential.addiction.psychological.level",
          "harm_potential.addiction.psychological.description",
          "harm_potential.addiction.physical_dependence.level",
          "harm_potential.addiction.physical_dependence.description",
          "harm_potential.toxicity.lethal_dosage.ld50",
          "harm_potential.toxicity.lethal_dosage.notes",
          "harm_potential.toxicity.organ_toxicity",
          "harm_potential.toxicity.carcinogenicity.level",
          "harm_potential.toxicity.carcinogenicity.evidence",
          "harm_potential.toxicity.carcinogenicity.description",
          "harm_potential.toxicity.antibiotic_function.level",
          "harm_potential.toxicity.antibiotic_function.description",
          "harm_potential.toxicity.other",
          "harm_potential.psychosis.level",
          "harm_potential.psychosis.description",
          "harm_potential.seizure.level",
          "harm_potential.seizure.description",
        ],
        defaultCollapsed: true,
      },
    ],
  },
  {
    id: "history-culture",
    label: "History & Culture",
    icon: "lucide:book-open",
    articleFields: ["history_culture"],
    editor: { visible: true, adapter: "HistoryCultureFieldsRHF", order: 11 },
    public: {
      visible: true,
      toc: true,
      renderer: "HistoryCultureSection",
      isPresent: (article) => {
        const historyCulture = article.history_culture;
        if (!historyCulture) return false;
        return historyCulture.content?.trim().length > 0 || (historyCulture.sections?.length ?? 0) > 0;
      },
    },
    generator: {
      promptKey: "history_culture",
      quoteSection: "history_culture",
      batchUpdate: true,
      prepopulateUpdate: false,
    },
    prompt: {
      sectionKey: "history_culture",
      description: "Discovery, medical history, cultural significance, notable figures",
      seedPath: "src/data/config/sectionPrompts/historyCulture.md",
      sourceMaterial: "extracted",
      editorVisible: true,
    },
  },
  {
    id: "legality",
    label: "Legality",
    icon: "lucide:scale",
    articleFields: ["legality"],
    editor: { visible: true, adapter: "LegalityFieldsRHF", order: 12 },
    public: {
      visible: true,
      toc: true,
      renderer: "LegalitySection",
      isPresent: (article) => {
        const legality = article.legality;
        if (!legality) return false;
        return (
          legality.international?.length > 0 ||
          (legality.countries && Object.keys(legality.countries).length > 0)
        );
      },
    },
    generator: {
      promptKey: "legality",
      quoteSection: "legality",
      batchUpdate: true,
      prepopulateUpdate: false,
    },
    prompt: {
      sectionKey: "legality",
      description: "International and country-specific legal status",
      seedPath: "src/data/config/sectionPrompts/legality.md",
      sourceMaterial: "extracted",
      editorVisible: true,
    },
    schemaSections: [
      {
        key: "legality",
        label: "Legality",
        icon: "lucide:scale",
        description: "Legal status by jurisdiction",
        fields: ["legality.international", "legality.countries"],
        defaultCollapsed: true,
      },
    ],
  },
  {
    id: "sources",
    label: "Sources",
    icon: "lucide:library",
    articleFields: ["references", "source_citations", "citations"],
    editor: { visible: true, adapter: "SourceCitationsFieldsRHF", order: 13 },
    public: {
      visible: true,
      toc: true,
      renderer: "CitationsSection",
      isPresent: (article) => hasProjectedSubstanceCitations({
        references: article.references,
        sourceCitations: article.source_citations,
        citations: article.citations,
      }),
    },
    schemaSections: [
      {
        key: "citations",
        label: "References",
        icon: "lucide:book-open",
        description: "Structured references first, with legacy compatibility link lists demoted below them.",
        fields: ["references", "source_citations", "citations"],
        defaultCollapsed: true,
      },
    ],
  },
  {
    id: "citations",
    label: "Citations",
    icon: "lucide:book-open",
    articleFields: ["citations"],
    editor: { visible: true, adapter: "CitationsFieldsRHF", order: 14 },
    public: { visible: false, toc: false },
  },
  {
    id: "editorial-review",
    label: "Editorial Review",
    icon: "lucide:list-checks",
    articleFields: ["editorial_review"],
    editor: {
      visible: true,
      adapter: "EditorialReviewFieldsRHF",
      order: 15,
      editorOnly: true,
    },
    public: { visible: false, toc: false },
  },
] as const satisfies readonly SubstanceSectionCatalogEntry[];

type CatalogEntry = (typeof ARTICLE_SECTION_CATALOG)[number];
type PromptCatalogEntry = Extract<CatalogEntry, { readonly prompt: CatalogPromptMeta }>;

const catalogEntries = ARTICLE_SECTION_CATALOG as readonly SubstanceSectionCatalogEntry[];

export type CatalogSectionPromptKey = PromptCatalogEntry["prompt"]["sectionKey"];

export interface CatalogSectionPromptDescriptor {
  key: `section_${CatalogSectionPromptKey}`;
  kind: "section";
  sectionKey: CatalogSectionPromptKey;
  label: string;
  description: string;
  seedPath: string;
  convexKey: `section_${CatalogSectionPromptKey}`;
  sourceMaterial: "none" | "extracted";
  editorVisible: boolean;
}

export function getSubstanceSectionManifestEntries(): SubstanceSectionManifestEntry[] {
  return catalogEntries.map(({ prompt: _prompt, schemaSections: _schemaSections, ...entry }) => entry);
}

export function getCatalogSchemaSections(): SchemaSectionMeta[] {
  return catalogEntries.flatMap((entry) => entry.schemaSections ?? []);
}

export function getCatalogSectionPromptDescriptors(): CatalogSectionPromptDescriptor[] {
  return catalogEntries.flatMap((entry) => {
    if (!entry.prompt) return [];
    const sectionKey = entry.prompt.sectionKey as CatalogSectionPromptKey;
    const key = `section_${sectionKey}` as `section_${CatalogSectionPromptKey}`;
    return [
      {
        key,
        kind: "section",
        sectionKey,
        label: entry.prompt.label ?? entry.label,
        description: entry.prompt.description,
        seedPath: entry.prompt.seedPath,
        convexKey: key,
        sourceMaterial: entry.prompt.sourceMaterial,
        editorVisible: entry.prompt.editorVisible,
      },
    ];
  });
}
