export const ARTICLE_SECTION_LABELS = {
  summary: "Summary", identification: "Identification", classification: "Classification",
  dosage: "Dosage and duration", subjective_effects: "Subjective effects", comparisons: "Comparisons",
  reagent_testing: "Reagent testing", pharmacology: "Pharmacology", interactions: "Interactions",
  tolerance: "Tolerance", harm_potential: "Harm potential", history_culture: "History and culture",
  legality: "Legality", references: "References",
} as const;
export type ArticleEditorSection = keyof typeof ARTICLE_SECTION_LABELS;

export const ARTICLE_EDITOR_SECTIONS: readonly ArticleEditorSection[] = [
  "summary", "identification", "classification", "dosage", "subjective_effects", "comparisons",
  "reagent_testing", "pharmacology", "interactions", "tolerance", "harm_potential", "history_culture",
  "legality", "references",
];

export function isArticleEditorSection(value: unknown): value is ArticleEditorSection {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ARTICLE_SECTION_LABELS, value);
}

const HOSTED_FIELDS: Record<string, ArticleEditorSection> = { duration: "dosage", title: "identification" };

export function articleSectionForPath(path: string): ArticleEditorSection | null {
  const head = /^[A-Za-z_]+/.exec(path)?.[0] ?? "";
  if (Object.prototype.hasOwnProperty.call(ARTICLE_SECTION_LABELS, head)) return head as ArticleEditorSection;
  return Object.prototype.hasOwnProperty.call(HOSTED_FIELDS, head) ? HOSTED_FIELDS[head] : null;
}
