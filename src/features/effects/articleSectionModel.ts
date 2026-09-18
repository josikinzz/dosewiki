import type { IconName } from "@/components/common/Icon";
import type { PublicTableOfContentsItem } from "@/components/common/PublicTableOfContents";
import type { EffectDetail } from "@/data/builders/library";
import type { AudioReplicationMetadata } from "@/types/replications";
import { icons } from "@/utils/iconNames";
import { effectMatchesCategorySlug } from "@/data/effectCategoryDefinitions";
import type { GuideClass } from "@/features/articles/domain/articleGuides";
import type { VCodeContent } from "./vcode/types";
import { msg } from "@/i18n/messages";
import { normalizeVCodeContent, unwrapTopLevelQuotes } from "./vcode/normalize";

/**
 * Subjective effect article from Postgres.
 */
export interface SubjectiveEffectArticle {
  slug: string;
  name: string;
  tags: string[];
  featured?: boolean;
  summary: string;
  description_raw: string;
  description_ast?: unknown;
  long_summary_raw?: string;
  long_summary_ast?: unknown;
  analysis_raw?: string;
  analysis_ast?: unknown;
  style_variations_raw?: string;
  style_variations_ast?: unknown;
  personal_commentary_raw?: string;
  personal_commentary_ast?: unknown;
  social_media_image?: string;
  gallery_order?: string[];
  audio_replications?: AudioReplicationMetadata[];
  see_also?: Array<{ location: string; title: string }>;
  external_links?: Array<{ url: string; title: string }>;
  citations?: Array<{ url: string; text: string; from?: string }>;
  subarticles?: Array<{ id: string; title: string }>;
  contributors?: string[];
}

export type EffectArticleReplicationState =
  | { kind: "none" }
  | { kind: "server"; galleryOrder: string[] }
  | { kind: "fallback"; galleryOrder: string[] };

interface EffectArticleHeroModel {
  name: string;
  summary?: string;
  icon: IconName;
  /**
   * The psychoactive class whose long-form guides grade this effect, set only
   * for the disconnective family: those effects are what the dissociative
   * intensity scale measures, so the article can offer the scale as a next
   * read. Absent for every other effect, and then no guide line renders.
   */
  guideClass?: GuideClass;
}

interface EffectArticleBaseSectionModel {
  id: string;
}

export interface EffectArticleRichSectionModel extends EffectArticleBaseSectionModel {
  kind: "overview" | "analysis" | "styleVariations" | "personalCommentary";
  title?: string;
  icon?: IconName;
  content: VCodeContent;
  citations?: SubjectiveEffectArticle["citations"];
  subarticles?: SubjectiveEffectArticle["subarticles"];
  attribution?: EffectArticleAttributionModel;
}

interface EffectArticleReplicationsSectionModel extends EffectArticleBaseSectionModel {
  kind: "replications";
  title: "Replications";
  icon: "lucide:image";
  state: Exclude<EffectArticleReplicationState, { kind: "none" }>;
}

interface EffectArticleAudioReplicationsSectionModel extends EffectArticleBaseSectionModel {
  kind: "audioReplications";
  title: "Audio Replications";
  icon: "lucide:volume-2";
  items: NonNullable<SubjectiveEffectArticle["audio_replications"]>;
}

interface EffectArticleRelatedSubstancesSectionModel extends EffectArticleBaseSectionModel {
  kind: "relatedSubstances";
  title: "Related Substances";
  icon: "lucide:flask-conical";
  groups: EffectDetail["groups"];
  total: number;
}

interface EffectArticleSourcesSectionModel extends EffectArticleBaseSectionModel {
  kind: "sources";
  citations?: SubjectiveEffectArticle["citations"];
  externalLinks?: SubjectiveEffectArticle["external_links"];
  seeAlso?: SubjectiveEffectArticle["see_also"];
}

interface EffectArticleContributorsSectionModel extends EffectArticleBaseSectionModel {
  kind: "contributors";
  contributors: string[];
}

interface EffectArticleAttributionModel {
  name: string;
  avatarSrc: string;
  /** When the attributed writing was authored, e.g. "~2017–2021". */
  era?: string;
}

type EffectArticleSectionModel =
  | EffectArticleRichSectionModel
  | EffectArticleReplicationsSectionModel
  | EffectArticleAudioReplicationsSectionModel
  | EffectArticleRelatedSubstancesSectionModel
  | EffectArticleSourcesSectionModel
  | EffectArticleContributorsSectionModel;

export interface EffectArticleModel {
  hero: EffectArticleHeroModel;
  sections: EffectArticleSectionModel[];
}

interface BuildEffectArticleModelOptions {
  effect: SubjectiveEffectArticle;
  effectDetail?: EffectDetail;
  replications?: EffectArticleReplicationState;
}

const EFFECT_PERSONAL_COMMENTARY_ATTRIBUTION: EffectArticleAttributionModel = {
  name: "Josie Kins",
  avatarSrc: "/profile-avatars/josie/avatar.webp",
  era: "~2017–2021",
};

/**
 * Every heading an effect article can carry, by section kind, so the table of
 * contents, the section headings and the glossary drafter all read one list.
 * Overview, sources and contributors render no heading of their own; their
 * entries are the TOC labels.
 */
export const EFFECT_ARTICLE_SECTION_TITLES = {
  overview: msg("Overview"),
  analysis: msg("Analysis"),
  styleVariations: msg("Style Variations"),
  replications: msg("Replications"),
  audioReplications: msg("Audio Replications"),
  personalCommentary: msg("Personal Commentary"),
  relatedSubstances: msg("Related Substances"),
  sources: msg("References"),
  contributors: msg("Contributors"),
} as const;

function getEffectArticleIcon(tags: string[]): IconName {
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  if (tagSet.has("visual")) return "lucide:eye";
  if (tagSet.has("auditory")) return "lucide:ear";
  if (tagSet.has("cognitive")) return "fluent:thinking-24-regular";
  if (tagSet.has("physical")) return "lucide:activity";
  if (tagSet.has("tactile")) return "lucide:hand";
  if (tagSet.has("multisensory")) return "lucide:cog";
  if (tagSet.has("smell and taste")) return "lucide:utensils";
  if (tagSet.has("geometric")) return "lucide:shapes";
  if (tagSet.has("hallucinatory state")) return "custom:elf";
  return icons.subjectiveEffectIndex;
}

function hasItems<T>(items: T[] | undefined): items is T[] {
  return Boolean(items?.length);
}

export function buildEffectArticleModel({
  effect,
  effectDetail,
  replications,
}: BuildEffectArticleModelOptions): EffectArticleModel {
  const sections: EffectArticleSectionModel[] = [];
  const descriptionContent = normalizeVCodeContent(effect.description_ast, effect.description_raw);

  if (descriptionContent) {
    sections.push({
      id: "overview",
      kind: "overview",
      content: descriptionContent,
      citations: effect.citations,
      subarticles: effect.subarticles,
    });
  }

  const analysisContent = normalizeVCodeContent(effect.analysis_ast, effect.analysis_raw);
  if (analysisContent) {
    sections.push({
      id: "analysis",
      kind: "analysis",      title: EFFECT_ARTICLE_SECTION_TITLES.analysis,
      icon: "lucide:microscope",
      content: analysisContent,
      citations: effect.citations,
      subarticles: effect.subarticles,
    });
  }

  const styleVariationsContent = normalizeVCodeContent(effect.style_variations_ast, effect.style_variations_raw);
  if (styleVariationsContent) {
    sections.push({
      id: "style-variations",
      kind: "styleVariations",      title: EFFECT_ARTICLE_SECTION_TITLES.styleVariations,
      icon: "lucide:palette",
      content: styleVariationsContent,
      citations: effect.citations,
      subarticles: effect.subarticles,
    });
  }

  if (replications?.kind === "server" || replications?.kind === "fallback") {
    sections.push({
      id: "replications",
      kind: "replications",      title: EFFECT_ARTICLE_SECTION_TITLES.replications,
      icon: "lucide:image",
      state: replications,
    });
  }

  if (hasItems(effect.audio_replications)) {
    sections.push({
      id: "audio-replications",
      kind: "audioReplications",      title: EFFECT_ARTICLE_SECTION_TITLES.audioReplications,
      icon: "lucide:volume-2",
      items: effect.audio_replications,
    });
  }

  const personalCommentaryContent = normalizeVCodeContent(
    effect.personal_commentary_ast,
    effect.personal_commentary_raw,
  );
  if (personalCommentaryContent) {
    sections.push({
      id: "commentary",
      kind: "personalCommentary",      title: EFFECT_ARTICLE_SECTION_TITLES.personalCommentary,
      icon: "lucide:quote",
      content: unwrapTopLevelQuotes(personalCommentaryContent),
      citations: effect.citations,
      subarticles: effect.subarticles,
      attribution: EFFECT_PERSONAL_COMMENTARY_ATTRIBUTION,
    });
  }

  if (effectDetail?.groups.length) {
    sections.push({
      id: "related-substances",
      kind: "relatedSubstances",      title: EFFECT_ARTICLE_SECTION_TITLES.relatedSubstances,
      icon: "lucide:flask-conical",
      groups: effectDetail.groups,
      total: effectDetail.definition.total,
    });
  }

  if (hasItems(effect.citations) || hasItems(effect.external_links) || hasItems(effect.see_also)) {
    sections.push({
      id: "sources",
      kind: "sources",
      citations: effect.citations,
      externalLinks: effect.external_links,
      seeAlso: effect.see_also,
    });
  }

  if (hasItems(effect.contributors)) {
    sections.push({
      id: "contributors",
      kind: "contributors",
      contributors: effect.contributors,
    });
  }

  return {
    hero: {
      name: effect.name,
      summary: effect.summary,
      icon: getEffectArticleIcon(effect.tags),
      // The disconnective family is the one the dissociative scale grades.
      ...(effectMatchesCategorySlug(effect, "disconnective-effects")
        ? { guideClass: "dissociative" as const }
        : {}),
    },
    sections,
  };
}

/**
 * Derive table-of-contents items from whatever sections an effect article
 * happens to have. Labels and icons mirror each section's own heading; the
 * sections that carry no heading of their own (overview / sources /
 * contributors) get explicit fallbacks that match how they render.
 */
export function getEffectArticleTocItems(article: EffectArticleModel): PublicTableOfContentsItem[] {
  return article.sections.map((section): PublicTableOfContentsItem => {
    switch (section.kind) {
      case "overview":
        return { id: section.id, label: EFFECT_ARTICLE_SECTION_TITLES.overview, icon: article.hero.icon };
      case "sources":
        return { id: section.id, label: EFFECT_ARTICLE_SECTION_TITLES.sources, icon: "lucide:list-ordered" };
      case "contributors":
        return { id: section.id, label: EFFECT_ARTICLE_SECTION_TITLES.contributors, icon: "lucide:users" };
      default:
        return {
          id: section.id,
          label: section.title ?? section.id,
          icon: section.icon ?? icons.subjectiveEffectIndex,
        };
    }
  });
}

export function getEffectArticleReplicationState(effect: SubjectiveEffectArticle): EffectArticleReplicationState {
  return effect.gallery_order?.length
    ? { kind: "server", galleryOrder: effect.gallery_order }
    : { kind: "none" };
}
