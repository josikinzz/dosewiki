export const GENERATION_SECTIONS = Object.freeze([
  "summary", "pharmacology", "tolerance", "harm_potential", "history_culture",
]);
export const GENERATION_MODEL = "openai-codex/gpt-5.6-sol";
export const GENERATION_THINKING = "low";
export const REGENERATION_AUDIT_VERSION = "excerpt-section-regeneration-v1";
export const REGENERATION_ARTIFACT_KIND = "excerpt_section_regeneration";

export function isRegenerationEligible(article) {
  return article?.priority === "low" || article?.priority === "hide_for_now" ||
    (Array.isArray(article?.index_categories) && article.index_categories.some((tag) =>
      typeof tag === "string" && tag.trim().toLowerCase() === "hidden"));
}
