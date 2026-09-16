import {
  getDefaultEditorialReview,
  type SubstanceArticle,
  type SubstancePriority as StoredSubstancePriority,
} from "../../schema";
import { normalizePharmacologySection } from "../../../lib/article/normalization.mjs";
import {
  isProjectionRecord,
  normalizeStoredSubstancePriority,
  resolveSubstanceSlug,
  type SubstanceArticleRecord,
} from "./substanceProjectionCore";

/**
 * The bounded editor-library row. Whole articles are hydrated on demand; this
 * family retains only picker, taxonomy, mechanism, effect-name, and review data.
 */
export type SubstanceEditorLibraryEntryProjection = {
  id: SubstanceArticleRecord["id"];
  slug: string;
  title: string;
  priority: StoredSubstancePriority;
  index_categories: string[];
  identification: SubstanceArticle["identification"];
  classification: SubstanceArticle["classification"];
  pharmacology: {
    binding_sites: Pick<
      SubstanceArticle["pharmacology"]["binding_sites"][number],
      "target" | "tag"
    >[];
  };
  subjective_effects: SubstanceArticle["subjective_effects"];
  editorial_review: SubstanceArticle["editorial_review"];
  /**
   * Bibliography size, projected so list consumers (the review queue) never
   * need the reference arrays themselves.
   */
  reference_count: number;
};

const SENSE_CATEGORY_KEYS = [
  "visual",
  "auditory",
  "tactile",
  "olfactory",
  "gustatory",
  "multisensory",
] as const satisfies readonly (keyof SubstanceArticle["subjective_effects"]["sensory"])[];

const EMPTY_SUBJECTIVE_EFFECTS_NOTES: SubstanceArticle["subjective_effects"]["notes"] = {
  overview: "",
  sensory: "",
  cognitive: "",
  physical: "",
};

function projectEffectNamesOnly(
  value: unknown,
): SubstanceArticle["subjective_effects"]["cognitive"] {
  const category = isProjectionRecord(value) ? value : {};
  return Object.fromEntries(
    Object.entries(category).map(([key, subcategory]) => {
      const effects =
        isProjectionRecord(subcategory) && Array.isArray(subcategory.effects)
          ? subcategory.effects
          : [];
      return [
        key,
        {
          note: "",
          effects: effects.flatMap((effect) =>
            isProjectionRecord(effect) && typeof effect.name === "string"
              ? [{ name: effect.name, description: "" }]
              : [],
          ),
        },
      ];
    }),
  );
}

function projectLibraryListSubjectiveEffects(
  value: SubstanceArticleRecord["subjective_effects"],
): SubstanceArticle["subjective_effects"] {
  const effects: Record<string, unknown> = isProjectionRecord(value) ? value : {};
  const sensory: Record<string, unknown> = isProjectionRecord(effects.sensory)
    ? effects.sensory
    : {};
  return {
    notes: EMPTY_SUBJECTIVE_EFFECTS_NOTES,
    sensory: Object.fromEntries(
      SENSE_CATEGORY_KEYS.map((sense) => {
        const senseCategory: Record<string, unknown> = isProjectionRecord(sensory[sense])
          ? sensory[sense]
          : {};
        return [
          sense,
          { note: "", subcategories: projectEffectNamesOnly(senseCategory.subcategories) },
        ];
      }),
    ) as SubstanceArticle["subjective_effects"]["sensory"],
    cognitive: projectEffectNamesOnly(effects.cognitive),
    physical: projectEffectNamesOnly(effects.physical),
  };
}

export function projectEditorLibraryEntry(
  article: SubstanceArticleRecord,
  referenceCount?: number,
): SubstanceEditorLibraryEntryProjection {
  const pharmacology = normalizePharmacologySection(article.pharmacology);
  return {
    id: article.id,
    slug: resolveSubstanceSlug(article),
    title: article.title,
    priority: normalizeStoredSubstancePriority(article.priority),
    index_categories: article.index_categories ?? [],
    identification: article.identification,
    classification: article.classification,
    pharmacology: {
      binding_sites: pharmacology.binding_sites.map((entry) => ({
        target: entry.target,
        ...(entry.tag === undefined ? {} : { tag: entry.tag }),
      })),
    },
    subjective_effects: projectLibraryListSubjectiveEffects(article.subjective_effects),
    editorial_review: article.editorial_review ?? getDefaultEditorialReview(),
    reference_count: referenceCount ?? (
      (article.references?.length ?? 0) +
      (article.source_citations?.length ?? 0) +
      (Array.isArray(article.citations) ? article.citations.length : 0)
    ),
  };
}
