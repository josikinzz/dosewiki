import type { IconName } from "@/components/common/Icon";
import type { SectionKey } from "@/data/config/sectionPrompts";
import { hasProjectedSubstanceCitations } from "@/lib/citations/substanceCitationCompatibility";
import type { SubstanceArticle } from "./article";
import { hasPharmacologyContent } from "../../../lib/article/normalization.js";
import type { QuoteSectionId } from "../../../lib/quoteSections.js";

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
    promptKey: SectionKey;
    quoteSection: QuoteSectionId | null;
    batchUpdate: boolean;
    prepopulateUpdate: boolean;
  };
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

export const SUBSTANCE_SECTION_MANIFEST: readonly SubstanceSectionManifestEntry[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "lucide:file-text",
    articleFields: ["title", "identification", "index_categories", "priority"],
    editor: { visible: true, adapter: "OverviewFieldsRHF", order: 1 },
    public: { visible: true, toc: false, renderer: "HeroSection" },
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
] as const;

export function getPublicTocSectionEntries() {
  return SUBSTANCE_SECTION_MANIFEST.filter(
    (entry) => entry.public.visible && entry.public.toc,
  );
}

export function getEditorSectionEntries() {
  return SUBSTANCE_SECTION_MANIFEST.filter((entry) => entry.editor.visible).sort(
    (left, right) => (left.editor.order ?? 0) - (right.editor.order ?? 0),
  );
}
