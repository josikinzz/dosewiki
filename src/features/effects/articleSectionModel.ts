import type { IconName } from "@/components/common/Icon";
import type { EffectDetail } from "@/data/builders/library";
import type { VCodeContent } from "./vcode/types";

/**
 * Subjective effect article from Convex.
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
  audio_replications?: Array<{ title: string; artist: string; resource: string }>;
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

export interface EffectArticleHeroModel {
  name: string;
  icon: IconName;
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

export interface EffectArticleReplicationsSectionModel extends EffectArticleBaseSectionModel {
  kind: "replications";
  title: "Replications";
  icon: "lucide:image";
  state: Exclude<EffectArticleReplicationState, { kind: "none" }>;
}

export interface EffectArticleAudioReplicationsSectionModel extends EffectArticleBaseSectionModel {
  kind: "audioReplications";
  title: "Audio Replications";
  icon: "lucide:volume-2";
  items: NonNullable<SubjectiveEffectArticle["audio_replications"]>;
}

export interface EffectArticleRelatedSubstancesSectionModel extends EffectArticleBaseSectionModel {
  kind: "relatedSubstances";
  title: "Related Substances";
  icon: "lucide:flask-conical";
  groups: EffectDetail["groups"];
  total: number;
}

export interface EffectArticleSourcesSectionModel extends EffectArticleBaseSectionModel {
  kind: "sources";
  citations?: SubjectiveEffectArticle["citations"];
  externalLinks?: SubjectiveEffectArticle["external_links"];
  seeAlso?: SubjectiveEffectArticle["see_also"];
}

export interface EffectArticleContributorsSectionModel extends EffectArticleBaseSectionModel {
  kind: "contributors";
  contributors: string[];
}

export interface EffectArticleAttributionModel {
  name: string;
  avatarSrc: string;
}

export type EffectArticleSectionModel =
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

export const EFFECT_PERSONAL_COMMENTARY_ATTRIBUTION: EffectArticleAttributionModel = {
  name: "Josie Kins",
  avatarSrc: "/profile-avatars/josie/avatar.webp",
};

export function getEffectArticleIcon(tags: string[]): IconName {
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
  return "lucide:sparkles";
}

function selectVCodeContent(ast: unknown, raw: string | undefined): VCodeContent | undefined {
  return (ast || raw) as VCodeContent | undefined;
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
  const descriptionContent = selectVCodeContent(effect.description_ast, effect.description_raw);

  if (descriptionContent) {
    sections.push({
      id: "overview",
      kind: "overview",
      content: descriptionContent,
      citations: effect.citations,
      subarticles: effect.subarticles,
    });
  }

  const analysisContent = selectVCodeContent(effect.analysis_ast, effect.analysis_raw);
  if (analysisContent) {
    sections.push({
      id: "analysis",
      kind: "analysis",
      title: "Analysis",
      icon: "lucide:microscope",
      content: analysisContent,
      citations: effect.citations,
      subarticles: effect.subarticles,
    });
  }

  const styleVariationsContent = selectVCodeContent(effect.style_variations_ast, effect.style_variations_raw);
  if (styleVariationsContent) {
    sections.push({
      id: "style-variations",
      kind: "styleVariations",
      title: "Style Variations",
      icon: "lucide:palette",
      content: styleVariationsContent,
      citations: effect.citations,
      subarticles: effect.subarticles,
    });
  }

  if (replications?.kind === "server" || replications?.kind === "fallback") {
    sections.push({
      id: "replications",
      kind: "replications",
      title: "Replications",
      icon: "lucide:image",
      state: replications,
    });
  }

  if (hasItems(effect.audio_replications)) {
    sections.push({
      id: "audio-replications",
      kind: "audioReplications",
      title: "Audio Replications",
      icon: "lucide:volume-2",
      items: effect.audio_replications,
    });
  }

  const personalCommentaryContent = selectVCodeContent(
    effect.personal_commentary_ast,
    effect.personal_commentary_raw,
  );
  if (personalCommentaryContent) {
    sections.push({
      id: "commentary",
      kind: "personalCommentary",
      title: "Personal Commentary",
      icon: "lucide:quote",
      content: personalCommentaryContent,
      citations: effect.citations,
      subarticles: effect.subarticles,
      attribution: EFFECT_PERSONAL_COMMENTARY_ATTRIBUTION,
    });
  }

  if (effectDetail?.groups.length) {
    sections.push({
      id: "related-substances",
      kind: "relatedSubstances",
      title: "Related Substances",
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
      icon: getEffectArticleIcon(effect.tags),
    },
    sections,
  };
}

export function getEffectArticleReplicationState(effect: SubjectiveEffectArticle): EffectArticleReplicationState {
  return effect.gallery_order?.length
    ? { kind: "server", galleryOrder: effect.gallery_order }
    : { kind: "none" };
}
