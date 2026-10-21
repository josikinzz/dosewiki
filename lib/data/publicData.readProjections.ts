import {
  priorityScore,
  trimExcerpt,
  type PublicEffectArticle,
  type PublicEffectIndexArticle,
  type PublicEffectIndexEntry,
  type PublicEffectPreview,
  type PublicSubstanceLibraryRecord,
  type PublicSubstancePreview,
  type PublicSubstanceRecord,
  type SubjectiveEffectDetailRecord,
  type SubjectiveEffectRecord,
  type SubstanceRecord,
} from "./publicData.shared";
import {
  type PublicSubstanceArticleRecord,
  parsePublicSubstanceRecord,
  parsePublicSubstanceRecords,
} from "./publicData.substanceContract";
import { normalizeVCodeContent } from "../../src/features/effects/vcode/normalize";
import { slugify } from "../../src/utils/slug";
import { normalizePublicEffectIndexArticle } from "./publicData.publicationProjection";
import {
  normalizeSubstancePriority,
  projectLibraryInput,
} from "../../src/data/projections/substanceReadProjections";

export const projectPublicEffectPreview = (effect: SubjectiveEffectRecord): PublicEffectPreview => ({
  name: effect.name,
  slug: effect.slug,
  summary: trimExcerpt(effect.summary, 170),
  featured: effect.featured === true,
  tags: effect.tags,
})

export const projectPublicEffectPreviews = (effects: SubjectiveEffectRecord[]): PublicEffectPreview[] =>
  effects.map(projectPublicEffectPreview).sort((left, right) => {
    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

export const projectPublicEffectIndex = (
  effects: PublicEffectIndexEntry[],
): PublicEffectIndexEntry[] =>
  effects.map((effect) => ({
    slug: effect.slug,
    name: effect.name,
    tags: effect.tags ?? [],
    featured: effect.featured === true,
  })).sort((left, right) => {
    if (left.featured !== right.featured) return left.featured ? -1 : 1;
    return left.name.localeCompare(right.name);
  });

export function normalizePublicEffectArticle(effect: SubjectiveEffectDetailRecord): SubjectiveEffectDetailRecord {
  return {
    slug: effect.slug,
    name: effect.name,
    tags: effect.tags,
    featured: effect.featured,
    summary: effect.summary,
    description_raw: effect.description_raw,
    description_ast: normalizeVCodeContent(effect.description_ast, undefined),
    long_summary_raw: effect.long_summary_raw,
    long_summary_ast: normalizeVCodeContent(effect.long_summary_ast, undefined),
    analysis_raw: effect.analysis_raw,
    analysis_ast: normalizeVCodeContent(effect.analysis_ast, undefined),
    style_variations_raw: effect.style_variations_raw,
    style_variations_ast: normalizeVCodeContent(effect.style_variations_ast, undefined),
    personal_commentary_raw: effect.personal_commentary_raw,
    personal_commentary_ast: normalizeVCodeContent(effect.personal_commentary_ast, undefined),
    social_media_image: effect.social_media_image,
    gallery_order: effect.gallery_order,
    audio_replications: effect.audio_replications,
    see_also: effect.see_also,
    external_links: effect.external_links,
    subarticles: effect.subarticles,
    contributors: effect.contributors,
    citations: effect.citations,
  };
}

export const normalizePublicEffectArticles = (effects: SubjectiveEffectDetailRecord[]): PublicEffectArticle[] =>
  effects.map(normalizePublicEffectArticle);

const resolveSubstanceSlug = (substance: Pick<SubstanceRecord, "slug" | "title">): string =>
  typeof substance.slug === "string" && substance.slug.length > 0
    ? substance.slug
    : slugify(substance.title);


function projectPublicSubstancePreview(substance: SubstanceRecord): PublicSubstancePreview {
  return {
    title: substance.title,
    slug: resolveSubstanceSlug(substance),
    summary: trimExcerpt(typeof substance.summary === "string" ? substance.summary : "", 200),
    priority: normalizeSubstancePriority(substance.priority),
    indexCategories: substance.index_categories,
  };
}

export function projectPublicSubstanceLibraryRecord(substance: SubstanceRecord): PublicSubstanceLibraryRecord {
  return projectLibraryInput(substance);
}

export function projectPublicSubstanceRecord(substance: SubstanceRecord): PublicSubstanceRecord {
  const { editorial_review: editorialReview, ...publicSubstance } = substance;
  const references = Array.isArray(substance.references)
    ? substance.references.map((reference) => {
        const { metadataProvenance: _metadataProvenance, ...publicReference } = reference;
        return publicReference;
      })
    : substance.references;

  return {
    ...publicSubstance,
    references,
    slug: resolveSubstanceSlug(substance),
    priority: normalizeSubstancePriority(substance.priority),
    expert_reviewed: editorialReview?.status === "completed",
  };
}

export const projectPublicSubstancePreviews = (substances: SubstanceRecord[]): PublicSubstancePreview[] =>
  substances.map(projectPublicSubstancePreview).sort((left, right) => {
    const priorityDelta = priorityScore[left.priority] - priorityScore[right.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.title.localeCompare(right.title);
  });


export function normalizePublicEffectIndexArticles(records: unknown[]): PublicEffectIndexArticle[] {
  return records.flatMap((record) => {
    const article = normalizePublicEffectIndexArticle(record);
    return article ? [article] : [];
  });
}

function omitPublicArticleReferenceProvenance(
  article: PublicSubstanceArticleRecord,
): PublicSubstanceArticleRecord {
  return {
    ...article,
    references: article.references.map((reference) => {
      const { metadataProvenance: _metadataProvenance, ...publicReference } = reference;
      return publicReference;
    }),
  };
}

export function parsePublicSubstanceRecordWithoutProvenance(
  record: unknown,
): PublicSubstanceArticleRecord {
  return omitPublicArticleReferenceProvenance(parsePublicSubstanceRecord(record));
}

export function parsePublicSubstanceRecordsWithoutProvenance(
  records: unknown[],
): PublicSubstanceArticleRecord[] {
  return parsePublicSubstanceRecords(records).map(
    omitPublicArticleReferenceProvenance,
  );
}
