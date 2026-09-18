import type { Classification, Identification } from "./classification";
import type { Interactions } from "./interactions";
import type { SubstanceArticle } from "./article";
import type { PublicArticleProjection } from "./editorialReviewVisibilityPolicy";
import type { PublicSubstanceLibraryInputRecord } from "../../../lib/data/publicData.substanceContract";
import {
  getLegacyAwareMechanismTags,
  normalizePharmacologySection,
  type NormalizedPharmacologySection,
} from "../../../lib/article/normalization.mjs";
import {
  hasProjectedSubstanceCitations,
  projectSubstanceCitationCompatibility,
} from "@/lib/citations/substanceCitationCompatibility";

export type SubstanceArticleProjectionInput =
  | SubstanceArticle
  | PublicArticleProjection<SubstanceArticle>
  | PublicSubstanceLibraryInputRecord;

type ArticleRecord = SubstanceArticleProjectionInput & Record<string, unknown>;
type ProjectedDosageRouteInput =
  SubstanceArticleProjectionInput["dosage"]["routes"][number];
type ProjectedDurationRouteInput =
  SubstanceArticleProjectionInput["duration"]["routes"][number];
type ProjectedHarmPotentialInput =
  SubstanceArticleProjectionInput["harm_potential"];

type ProjectedCitation = {
  label: string;
  href?: string;
}

type ProjectedSectionAvailability = {
  routes: boolean;
  pharmacology: boolean;
  interactions: boolean;
  harmPotential: boolean;
  citations: boolean;
}

export type SubstanceArticlePublicProjection = {
  raw: SubstanceArticleProjectionInput;
  identity: {
    id: number | null;
    title: string;
    commonName: string;
    substitutiveName: string;
    iupacName: string;
    candidateNames: string[];
    displayName: string | null;
  };
  taxonomy: {
    indexCategories: string[];
    chemicalClasses: string[];
    psychoactiveClasses: string[];
  };
  routes: {
    dosage: ProjectedDosageRouteInput[];
    duration: ProjectedDurationRouteInput[];
  };
  pharmacology: {
    normalized: NormalizedPharmacologySection;
    mechanismTags: string[];
    halfLife?: string;
  };
  interactions: Interactions;
  harmPotential: ProjectedHarmPotentialInput;
  citations: {
    source: ProjectedCitation[];
    supporting: ProjectedCitation[];
  };
  sectionAvailability: ProjectedSectionAvailability;
};

export type SubstanceArticleEditorProjection = SubstanceArticlePublicProjection & {
  editorialReview: SubstanceArticle["editorial_review"];
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => cleanString(entry)).filter((entry) => entry.length > 0)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function projectCitations(citations: unknown): ProjectedCitation[] {
  if (!Array.isArray(citations)) {
    return [];
  }

  return citations.reduce<ProjectedCitation[]>((entries, citation) => {
    if (!isRecord(citation)) {
      return entries;
    }

    const label = cleanString(citation.name);
    if (!label) {
      return entries;
    }

    const href = cleanString(citation.url);
    entries.push(href ? { label, href } : { label });
    return entries;
  }, []);
}

export function resolveSubstanceDisplayName(
  article: Pick<SubstanceArticleProjectionInput, "title">,
  identification: Partial<Identification>,
): string | null {
  const commonName = cleanString(identification.common_name);
  const substitutiveName = cleanString(identification.substitutive_name);
  const iupacName = cleanString(identification.iupac_name);
  const title = cleanString(article.title);
  const candidateNames = [commonName, title, substitutiveName, iupacName].filter(
    (value): value is string => Boolean(value),
  );
  return candidateNames.find((value) => !value.includes("(")) ?? candidateNames[0] ?? null;
}

function projectIdentity(article: SubstanceArticleProjectionInput, identification: Partial<Identification>) {
  const commonName = cleanString(identification.common_name);
  const substitutiveName = cleanString(identification.substitutive_name);
  const iupacName = cleanString(identification.iupac_name);
  const title = cleanString(article.title);
  const candidateNames = [commonName, title, substitutiveName, iupacName].filter(
    (value): value is string => Boolean(value),
  );
  const displayName = resolveSubstanceDisplayName(article, identification);

  return {
    id: typeof article.id === "number" ? article.id : null,
    title,
    commonName,
    substitutiveName,
    iupacName,
    candidateNames,
    displayName,
  };
}

function projectTaxonomy(article: SubstanceArticleProjectionInput, classification: Partial<Classification>) {
  return {
    indexCategories: cleanStringArray(article.index_categories),
    chemicalClasses: cleanStringArray(classification.chemical_class),
    psychoactiveClasses: cleanStringArray(classification.psychoactive_class),
  };
}

function projectInteractions(interactions: unknown): Interactions {
  const record = isRecord(interactions) ? interactions : {};
  return {
    dangerous: cleanStringArray(record.dangerous),
    unsafe: cleanStringArray(record.unsafe),
    caution: cleanStringArray(record.caution),
  };
}

function hasHarmPotentialContent(harmPotential: ProjectedHarmPotentialInput): boolean {
  if (!isRecord(harmPotential)) {
    return false;
  }
  const record = harmPotential as Record<string, unknown>;

  return (
    record.addiction !== undefined ||
    record.toxicity !== undefined ||
    record.psychosis !== undefined ||
    record.seizure !== undefined
  );
}

function hasPharmacologyContent(pharmacology: NormalizedPharmacologySection): boolean {
  return (
    pharmacology.pharmacodynamics.trim().length > 0 ||
    (pharmacology.summary ?? "").trim().length > 0 ||
    pharmacology.binding_sites.length > 0 ||
    pharmacology.pharmacokinetics.trim().length > 0 ||
    pharmacology.metabolites.length > 0
  );
}

function projectPublic(article: SubstanceArticleProjectionInput): SubstanceArticlePublicProjection {
  const rawArticle = article as ArticleRecord;
  const identification = (rawArticle.identification ?? {}) as Partial<Identification>;
  const classification = (rawArticle.classification ?? {}) as Partial<Classification>;
  const normalizedPharmacology = normalizePharmacologySection(
    rawArticle.pharmacology,
  ) as NormalizedPharmacologySection;
  const interactions = projectInteractions(rawArticle.interactions);
  const citationCompatibility = projectSubstanceCitationCompatibility({
    references: article.references,
    sourceCitations: rawArticle.source_citations,
    citations: rawArticle.citations,
  });
  const sourceCitations = projectCitations(citationCompatibility.sourceCitations);
  const supportingCitations = projectCitations(citationCompatibility.citations);

  const routes = {
    dosage: Array.isArray(article.dosage?.routes) ? article.dosage.routes : [],
    duration: Array.isArray(article.duration?.routes) ? article.duration.routes : [],
  };
  const pharmacology = {
    normalized: normalizedPharmacology,
    mechanismTags: getLegacyAwareMechanismTags(rawArticle.pharmacology),
    halfLife: cleanString(normalizedPharmacology.half_life) || undefined,
  };

  return {
    raw: article,
    identity: projectIdentity(article, identification),
    taxonomy: projectTaxonomy(article, classification),
    routes,
    pharmacology,
    interactions,
    harmPotential: article.harm_potential,
    citations: {
      source: sourceCitations,
      supporting: supportingCitations,
    },
    sectionAvailability: {
      routes: routes.dosage.length > 0 || routes.duration.length > 0,
      pharmacology: hasPharmacologyContent(normalizedPharmacology),
      interactions:
        interactions.dangerous.length > 0 ||
        interactions.unsafe.length > 0 ||
        interactions.caution.length > 0,
      harmPotential: hasHarmPotentialContent(article.harm_potential),
      citations: hasProjectedSubstanceCitations({
        references: article.references,
        sourceCitations: rawArticle.source_citations,
        citations: rawArticle.citations,
      }),
    },
  };
}

export function projectSubstanceArticle(article: SubstanceArticleProjectionInput): SubstanceArticlePublicProjection {
  return projectPublic(article);
}

export function projectSubstanceArticleForEditor(
  article: SubstanceArticle,
): SubstanceArticleEditorProjection {
  return {
    ...projectPublic(article),
    editorialReview: article.editorial_review,
  };
}
