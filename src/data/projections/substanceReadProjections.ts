import { contentHash } from "../../../lib/proposals/contentHash";
import {
  getDefaultEditorialReview,
  normalizeMechanisms,
  resolveSubstanceDisplayName,
  type SubstanceArticle,
  type SubstancePriority as StoredSubstancePriority,
} from "../../schema";
import {
  getLegacyAwareMechanismTags,
  normalizePharmacologySection,
} from "../../../lib/article/normalization.mjs";
import type { MechanismRouteSubstanceInput } from "../builders/mechanismRouteDerivation";
import type {
  ContributorReviewedArticle,
  ReviewedArticleCredit,
} from "../../types/reviewedArticles";
import {
  isProjectionRecord as isRecord,
  normalizeStoredSubstancePriority,
  type SubstanceArticleRecord,
} from "./substanceProjectionCore";
export {
  normalizeSubstancePriority,
} from "./substanceProjectionCore";
import {
  normalizeSubstancePriority,
  resolveSubstanceSlug,
  trimSubstanceExcerpt,
  type PublicSubstancePriority,
} from "./substanceProjectionCore";
export {
  projectEditorLibraryEntry,
} from "./substanceEditorReadProjections";


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

export type SubstanceEffectMembershipInput = Pick<SubstanceLibraryInputProjection,
  "id" | "title" | "slug" | "priority" | "index_categories" | "identification" | "classification" | "subjective_effects"
>;

/** Membership and category presentation need no dosage, chemistry or article prose. */
export function projectEffectMembershipInput(article: SubstanceArticleRecord): SubstanceEffectMembershipInput {
  return omitUndefinedDeep({
    id: article.id,
    title: article.title,
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
    index_categories: article.index_categories,
    identification: article.identification,
    classification: article.classification,
    subjective_effects: article.subjective_effects,
  });
}

type SubstancePublicReferenceProjection = Omit<
  SubstanceArticle["references"][number],
  "metadataProvenance"
>;
export type SubstancePublicArticleProjection = Omit<SubstanceArticleRecord, "editorial_review" | "references"> & {
  slug: string;
  publicRevision: string;
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

/**
 * Search-summary projection. Localized search hashes the exact leaf the full
 * article projection serves (`projectPublicArticle` passes `summary` through
 * untouched), so this keeps the raw stored bytes instead of the preview
 * excerpt; otherwise a long summary hashes differently and localized
 * secondary lines silently fall back to English.
 */
export type SubstanceSearchSummaryProjection = {
  title: string;
  slug: string;
  summary: string;
};

export function projectSubstanceSearchSummary(article: SubstanceArticleRecord): SubstanceSearchSummaryProjection {
  return {
    title: article.title,
    slug: resolveSubstanceSlug(article),
    summary: article.summary,
  };
}

const LIBRARY_REFERENCE_IDENTIFIERS = [
  "url",
  "doi",
  "pmid",
  "isbn",
] as const satisfies readonly LibraryReferenceIdentifier[];


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


const isCompletedEditorialReview = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as { status?: unknown }).status === "completed"

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

/**
 * Public-safe review credit: which contributor profile completed the expert
 * review of which article. The stored reviewer email is looked up in the
 * profile-claimed email index and then discarded — only the slug and the
 * claiming profile key leave this function, keeping `editorial_review` as
 * internal as it is everywhere else in this module. Returns null for articles
 * without a completed review or whose reviewer no profile claims.
 */
export function projectReviewedArticleCredit(
  article: SubstanceArticleRecord,
  emailToProfileKey: ReadonlyMap<string, string>,
): ReviewedArticleCredit | null {
  const review = article.editorial_review;
  if (!isCompletedEditorialReview(review)) {
    return null;
  }
  const { reviewed_by: reviewedBy } = review as { reviewed_by?: unknown };
  if (typeof reviewedBy !== "string") {
    return null;
  }
  const profileKey = emailToProfileKey.get(reviewedBy.trim().toLowerCase());
  return profileKey ? { slug: resolveSubstanceSlug(article), profileKey } : null;
}

function projectPublicReference(
  reference: SubstanceArticle["references"][number],
): SubstancePublicReferenceProjection {
  const { metadataProvenance: _metadataProvenance, ...publicReference } = reference;
  return publicReference;
}

export function projectPublicArticle(article: SubstanceArticleRecord): SubstancePublicArticleProjection {
  const { editorial_review: editorialReview, ...publicArticle } = article;
  const projection = {
    ...publicArticle,
    pharmacology: normalizePharmacologySection(article.pharmacology),
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
    references: (article.references ?? []).map(projectPublicReference),
    expert_reviewed: isCompletedEditorialReview(editorialReview),
  };
  // Postgres identity and editorial-only fields do not name rendered content.
  const { _id: _id, _creationTime: _creationTime, publicRevision: _revision, ...content } =
    projection as typeof projection & { _id?: unknown; _creationTime?: unknown; publicRevision?: unknown };
  return { ...projection, publicRevision: contentHash(content) };
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
