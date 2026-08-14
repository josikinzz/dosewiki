import { slugify } from "./substanceIngestion";
import {
  getDefaultEditorialReview,
  normalizeMechanisms,
  resolveSubstanceDisplayName,
  type SubstanceArticle,
  type SubstancePriority as StoredSubstancePriority,
} from "../../src/schema";
import {
  getLegacyAwareMechanismTags,
  normalizePharmacologySection,
} from "../../lib/article/normalization.mjs";
import type { MechanismRouteSubstanceInput } from "../../src/data/builders/mechanismRouteDerivation";
import type { ContributorReviewedArticle } from "../../src/types/reviewedArticles";

export type PublicSubstancePriority = Exclude<
  StoredSubstancePriority,
  "hide_for_now"
>;

type SubstanceArticleRecord = Omit<SubstanceArticle, "priority" | "editorial_review" | "references"> & {
  slug?: string;
  priority?: StoredSubstancePriority | null;
  editorial_review?: SubstanceArticle["editorial_review"];
  references?: SubstanceArticle["references"];
};

export type SubstanceLookupProjection = {
  slug: string;
  name: string;
  priority: PublicSubstancePriority;
};

/**
 * Lookup plus the article facets editor pickers need to order and label their
 * lists: the raw visibility inputs (`substanceVisibility`) and the psychoactive
 * classes used as a category. Kept off the public lookup, which only needs the
 * slug/name map.
 */
export type SubstanceEditorLookupProjection = Omit<SubstanceLookupProjection, "priority"> & {
  priority: StoredSubstancePriority;
  indexCategories: string[];
  psychoactiveClasses: string[];
};

export type SubstancePublicPreviewProjection = {
  title: string;
  slug: string;
  summary: string;
  priority: PublicSubstancePriority;
  indexCategories: string[];
};

type LibraryReferenceIdentifier = "url" | "doi" | "pmid" | "isbn";
type LibraryReferenceProjection = Partial<
  Pick<SubstanceArticle["references"][number], LibraryReferenceIdentifier>
>;
type LibraryDosageRouteProjection = Pick<
  SubstanceArticle["dosage"]["routes"][number],
  "route" | "dose_ranges" | "bioavailability" | "notes"
>;
type LibraryDurationRouteProjection = Pick<
  SubstanceArticle["duration"]["routes"][number],
  "route" | "stages"
>;
type LibraryBindingSiteEntryProjection = Pick<
  SubstanceArticle["pharmacology"]["binding_sites"][number],
  "target" | "tag" | "affinity" | "efficacy"
>;

const LIBRARY_PHARMACOLOGY_KEYS = [
  "pharmacodynamics",
  "summary",
  "pharmacokinetics",
  "metabolites",
  "protein_binding",
  "volume_of_distribution",
  "route_bioavailability",
  "route_half_life",
  "route_half_life_notes",
  "route_bioavailability_notes",
  "bioavailability_notes",
  "half_life",
] as const satisfies readonly (keyof SubstanceArticle["pharmacology"])[];

type LibraryPharmacologyProjection = Pick<
  SubstanceArticle["pharmacology"],
  (typeof LIBRARY_PHARMACOLOGY_KEYS)[number]
> & {
  binding_sites: LibraryBindingSiteEntryProjection[];
};

export type SubstanceLibraryInputProjection = Pick<
  SubstancePublicArticleProjection,
  | "id"
  | "title"
  | "slug"
  | "priority"
  | "index_categories"
  | "identification"
  | "classification"
  | "summary"
  | "subjective_effects"
  | "tolerance"
  | "reagent_testing"
  | "interactions"
  | "source_citations"
  | "citations"
  | "expert_reviewed"
> & {
  references: LibraryReferenceProjection[];
  harm_potential: { addiction_liability?: string };
  dosage: { routes: LibraryDosageRouteProjection[] };
  duration: { routes: LibraryDurationRouteProjection[] };
  pharmacology: LibraryPharmacologyProjection;
};

export type SubstanceSearchInputProjection = {
  title: string;
  slug: string;
  priority: PublicSubstancePriority;
  index_categories: string[];
  identification?: unknown;
  classification?: unknown;
  pharmacology?: unknown;
  subjective_effects?: unknown;
};

export type SubstanceMechanismRouteInputProjection =
  MechanismRouteSubstanceInput;

export type SubstanceRandomPreviewProjection = SubstancePublicPreviewProjection;
type SubstancePublicReferenceProjection = Omit<
  SubstanceArticle["references"][number],
  "metadataProvenance"
>;
export type SubstancePublicArticleProjection = Omit<SubstanceArticleRecord, "editorial_review" | "references"> & {
  slug: string;
  priority: PublicSubstancePriority;
  references: SubstancePublicReferenceProjection[];
  /**
   * Public-safe derivation of the editor-only `editorial_review` field: `true`
   * only when an editor has marked the article's review as completed. The full
   * `editorial_review` object (including private notes) is never exposed.
   */
  expert_reviewed: boolean;
};
export type SubstanceEditorArticleProjection = SubstanceArticleRecord & {
  slug: string;
  priority: StoredSubstancePriority;
  editorial_review: SubstanceArticle["editorial_review"];
  references: SubstanceArticle["references"];
};

const normalizeStoredSubstancePriority = (
  priority: SubstanceArticleRecord["priority"],
): StoredSubstancePriority => priority ?? "normal";

export const normalizeSubstancePriority = (
  priority: SubstanceArticleRecord["priority"],
): PublicSubstancePriority => {
  const normalized = normalizeStoredSubstancePriority(priority);
  return normalized === "hide_for_now" ? "low" : normalized;
};

export const resolveSubstanceSlug = (article: Pick<SubstanceArticleRecord, "slug" | "title">): string =>
  article.slug ?? slugify(article.title);

export const trimSubstanceExcerpt = (value: unknown, maxLength = 200): string => {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

export function projectLookup(article: SubstanceArticleRecord): SubstanceLookupProjection {
  return {
    slug: resolveSubstanceSlug(article),
    name: article.title,
    priority: normalizeSubstancePriority(article.priority),
  };
}

export function projectEditorLookup(
  article: SubstanceArticleRecord,
): SubstanceEditorLookupProjection {
  const classification: Record<string, unknown> = isRecord(article.classification)
    ? article.classification
    : {};
  const psychoactiveClasses = Array.isArray(classification.psychoactive_class)
    ? classification.psychoactive_class
    : [];

  return {
    slug: resolveSubstanceSlug(article),
    name: article.title,
    priority: normalizeStoredSubstancePriority(article.priority),
    indexCategories: article.index_categories ?? [],
    psychoactiveClasses: psychoactiveClasses.filter(
      (value): value is string => typeof value === "string",
    ),
  };
}

export function projectPublicPreview(article: SubstanceArticleRecord): SubstancePublicPreviewProjection {
  return {
    title: article.title,
    slug: resolveSubstanceSlug(article),
    summary: trimSubstanceExcerpt(article.summary, 200),
    priority: normalizeSubstancePriority(article.priority),
    indexCategories: article.index_categories,
  };
}

const LIBRARY_REFERENCE_IDENTIFIERS = [
  "url",
  "doi",
  "pmid",
  "isbn",
] as const satisfies readonly LibraryReferenceIdentifier[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function omitUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      entry === undefined ? [] : [omitUndefinedDeep(entry)],
    ) as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, omitUndefinedDeep(entry)]],
      ),
    ) as T;
  }

  return value;
}

function projectLibraryReference(reference: unknown): LibraryReferenceProjection {
  if (!isRecord(reference)) {
    return {};
  }

  return Object.fromEntries(
    LIBRARY_REFERENCE_IDENTIFIERS.flatMap((key) =>
      reference[key] === undefined ? [] : [[key, reference[key]]],
    ),
  ) as LibraryReferenceProjection;
}

function projectRangeRecord(
  value: unknown,
  keys: readonly string[],
  defaultMissingRanges = false,
): Record<string, unknown> {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(
    keys.map((key) => {
      const range = isRecord(record[key]) ? record[key] : null;
      return [
        key,
        range
          ? {
              min: range.min,
              max: range.max,
              unit: range.unit,
            }
          : defaultMissingRanges
            ? {
                min: null,
                max: null,
                unit: "",
              }
            : {
                min: undefined,
                max: undefined,
                unit: undefined,
              },
      ];
    }),
  );
}

function projectLibraryDosage(
  dosage: SubstanceArticleRecord["dosage"],
): SubstanceLibraryInputProjection["dosage"] {
  const routes = isRecord(dosage) && Array.isArray(dosage.routes)
    ? dosage.routes
    : [];
  return {
    routes: routes.flatMap((route) => {
      if (!isRecord(route)) {
        return [];
      }

      return [{
        route: route.route,
        dose_ranges: projectRangeRecord(route.dose_ranges, [
          "threshold",
          "light",
          "moderate",
          "strong",
          "heavy",
        ]) as LibraryDosageRouteProjection["dose_ranges"],
        bioavailability: route.bioavailability,
        notes: route.notes,
      }];
    }),
  };
}

function projectLibraryDuration(
  duration: SubstanceArticleRecord["duration"],
): SubstanceLibraryInputProjection["duration"] {
  const routes = isRecord(duration) && Array.isArray(duration.routes)
    ? duration.routes
    : [];
  return {
    routes: routes.flatMap((route) => {
      if (!isRecord(route)) {
        return [];
      }

      return [{
        route: route.route,
        stages: projectRangeRecord(route.stages, [
          "onset",
          "come_up",
          "peak",
          "offset",
          "after_effects",
          "total_duration",
        ], true) as LibraryDurationRouteProjection["stages"],
      }];
    }),
  };
}

function projectLibraryPharmacology(
  value: SubstanceArticleRecord["pharmacology"],
): LibraryPharmacologyProjection {
  const pharmacology = normalizePharmacologySection(value);
  const bindingSites = pharmacology.binding_sites;
  const projected = Object.fromEntries(
    LIBRARY_PHARMACOLOGY_KEYS.flatMap((key) =>
      pharmacology[key] === undefined ? [] : [[key, pharmacology[key]]],
    ),
  );

  return {
    ...projected,
    binding_sites: bindingSites.map((entry) => ({
      target: entry.target,
      ...(entry.tag === undefined ? {} : { tag: entry.tag }),
      ...(entry.affinity === undefined ? {} : { affinity: entry.affinity }),
      ...(entry.efficacy === undefined ? {} : { efficacy: entry.efficacy }),
    })),
  } as LibraryPharmacologyProjection;
}

export function projectLibraryInput(article: SubstanceArticleRecord): SubstanceLibraryInputProjection {
  const harmPotential = isRecord(article.harm_potential)
    ? article.harm_potential
    : {};
  const references = Array.isArray(article.references)
    ? article.references
    : [];

  return omitUndefinedDeep({
    id: article.id,
    title: article.title,
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
    index_categories: article.index_categories,
    identification: article.identification,
    classification: article.classification,
    summary: article.summary,
    dosage: projectLibraryDosage(article.dosage),
    duration: projectLibraryDuration(article.duration),
    subjective_effects: article.subjective_effects,
    pharmacology: projectLibraryPharmacology(article.pharmacology),
    interactions: article.interactions,
    reagent_testing: article.reagent_testing,
    tolerance: article.tolerance,
    harm_potential: typeof harmPotential.addiction_liability === "string"
      ? { addiction_liability: harmPotential.addiction_liability }
      : {},
    references: references.map(projectLibraryReference),
    source_citations: article.source_citations,
    citations: article.citations,
    expert_reviewed: isCompletedEditorialReview(article.editorial_review),
  });
}

export function projectSearchInput(article: SubstanceArticleRecord): SubstanceSearchInputProjection {
  return {
    title: article.title,
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
    index_categories: article.index_categories,
    identification: article.identification,
    classification: article.classification,
    pharmacology: normalizePharmacologySection(article.pharmacology),
    subjective_effects: article.subjective_effects,
  };
}

export function projectMechanismRouteInput(
  article: SubstanceArticleRecord,
): SubstanceMechanismRouteInputProjection {
  const canonicalPharmacology = projectLibraryPharmacology(
    article.pharmacology,
  );

  return omitUndefinedDeep({
    displayName: resolveSubstanceDisplayName(
      article,
      article.identification ?? {},
    ),
    priority: normalizeSubstancePriority(article.priority),
    indexCategories: article.index_categories,
    mechanisms: normalizeMechanisms(
      getLegacyAwareMechanismTags(canonicalPharmacology),
    ),
  });
}

export const isCompletedEditorialReview = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as { status?: unknown }).status === "completed";

/**
 * Public-safe reviewed-articles aggregate entry. The reviewer email set is
 * matched here and then discarded: the projection carries only the article's
 * identity and the completion timestamp, so `editorial_review` (reviewer
 * email, private notes, flags) stays as internal as everywhere else in this
 * module. Returns null for articles the given reviewer set did not review.
 */
export function projectReviewedArticleForEmails(
  article: SubstanceArticleRecord,
  reviewerEmails: ReadonlySet<string>,
): ContributorReviewedArticle | null {
  const review = article.editorial_review;
  if (!isCompletedEditorialReview(review)) {
    return null;
  }
  const { reviewed_by: reviewedBy, reviewed_at: reviewedAt } = review as {
    reviewed_by?: unknown;
    reviewed_at?: unknown;
  };
  if (
    typeof reviewedBy !== "string" ||
    !reviewerEmails.has(reviewedBy.trim().toLowerCase())
  ) {
    return null;
  }
  return {
    title: article.title,
    slug: resolveSubstanceSlug(article),
    reviewed_at: typeof reviewedAt === "string" ? reviewedAt : null,
  };
}

function projectPublicReference(
  reference: SubstanceArticle["references"][number],
): SubstancePublicReferenceProjection {
  const { metadataProvenance: _metadataProvenance, ...publicReference } = reference;
  return publicReference;
}

export function projectPublicArticle(article: SubstanceArticleRecord): SubstancePublicArticleProjection {
  const { editorial_review: editorialReview, ...publicArticle } = article;
  return {
    ...publicArticle,
    pharmacology: normalizePharmacologySection(article.pharmacology),
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
    references: (article.references ?? []).map(projectPublicReference),
    expert_reviewed: isCompletedEditorialReview(editorialReview),
  };
}

export function projectEditorArticle(article: SubstanceArticleRecord): SubstanceEditorArticleProjection {
  return {
    ...article,
    pharmacology: normalizePharmacologySection(article.pharmacology),
    slug: resolveSubstanceSlug(article),
    priority: normalizeStoredSubstancePriority(article.priority),
    editorial_review: article.editorial_review ?? getDefaultEditorialReview(),
    references: article.references ?? [],
  };
}

/**
 * Editor *library list* projection.
 *
 * `projectEditorArticle` ships whole articles, and the editor library drains
 * every row: 577 articles is ~16.7 MB, almost all of it prose and references
 * that only the one article on screen ever renders. This projection carries
 * only what the library list, the pickers, the search box, and `buildLibrary`
 * read across every row; the selected article is hydrated on demand through
 * `getEditorBySlug`.
 *
 * Included, and why:
 *  - `id`, `slug`, `title`, `priority`, `index_categories` — picker rows,
 *    slug/id resolution, visibility filtering, changelog keying.
 *  - `identification`, `classification` — display names, aliases, and the
 *    chemical/psychoactive taxonomy the index-layout tool groups by.
 *  - `pharmacology.binding_sites` reduced to `target`/`tag` — the mechanism
 *    tags behind the auto mechanism index groups. No pharmacology prose.
 *  - `subjective_effects` reduced to effect *names* — the effect index counts
 *    only need identity, and the descriptions are the bulk of the section.
 *  - `editorial_review` — review status and flags drive the picker and the
 *    review queue, and it is exactly why this stays editor-gated.
 *
 * Deliberately omitted: `summary`, `dosage`, `duration`, `interactions`,
 * `tolerance`, `reagent_testing`, `harm_potential`, `history_culture`,
 * `legality`, `comparisons`, `section_gaps`, `references`, `source_citations`,
 * and `citations`. Anything that needs those needs a whole article.
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

/**
 * Effect names without their descriptions. Names are what the effect index
 * joins and counts on; the descriptions are ~90% of the section's bytes and
 * are only ever rendered from a whole article.
 */
function projectEffectNamesOnly(
  value: unknown,
): SubstanceArticle["subjective_effects"]["cognitive"] {
  const category = isRecord(value) ? value : {};

  return Object.fromEntries(
    Object.entries(category).map(([key, subcategory]) => {
      const effects = isRecord(subcategory) && Array.isArray(subcategory.effects)
        ? subcategory.effects
        : [];

      return [
        key,
        {
          note: "",
          effects: effects.flatMap((effect) =>
            isRecord(effect) && typeof effect.name === "string"
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
  const effects: Record<string, unknown> = isRecord(value) ? value : {};
  const sensory: Record<string, unknown> = isRecord(effects.sensory) ? effects.sensory : {};

  return {
    notes: EMPTY_SUBJECTIVE_EFFECTS_NOTES,
    sensory: Object.fromEntries(
      SENSE_CATEGORY_KEYS.map((sense) => {
        const senseCategory: Record<string, unknown> = isRecord(sensory[sense])
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
  };
}

export const compareSubstancePreviews = (
  left: SubstancePublicPreviewProjection,
  right: SubstancePublicPreviewProjection,
) => {
  const priorityScore: Record<PublicSubstancePriority, number> = {
    high: 0,
    normal: 1,
    low: 2,
  };
  const priorityDelta = priorityScore[left.priority] - priorityScore[right.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return left.title.localeCompare(right.title);
};
