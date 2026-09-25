/**
 * The in-page editor's sections and the field paths each one owns. Kept apart
 * from the section form so validation and diff code can name a section
 * without importing the form's field components.
 */

export const ARTICLE_SECTION_LABELS = {
  summary: "Summary", identification: "Identification", classification: "Classification",
  dosage: "Dosage and duration", subjective_effects: "Subjective effects", comparisons: "Comparisons",
  reagent_testing: "Reagent testing", pharmacology: "Pharmacology", interactions: "Interactions",
  tolerance: "Tolerance", harm_potential: "Harm potential", history_culture: "History and culture",
  legality: "Legality", references: "References",
} as const;
export type ArticleEditorSection = keyof typeof ARTICLE_SECTION_LABELS;

/** Whether a value, such as a section named in a link, is one of the in-page editor's sections. */
export function isArticleEditorSection(value: unknown): value is ArticleEditorSection {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ARTICLE_SECTION_LABELS, value);
}

/** Fields that live inside another section's form. */
const HOSTED_FIELDS: Record<string, ArticleEditorSection> = { duration: "dosage", title: "identification" };

/**
 * The section whose form edits a field path, read from the path's first
 * segment. Null when no in-page section owns the field.
 */
export function articleSectionForPath(path: string): ArticleEditorSection | null {
  const head = /^[A-Za-z_]+/.exec(path)?.[0] ?? "";
  if (Object.prototype.hasOwnProperty.call(ARTICLE_SECTION_LABELS, head)) return head as ArticleEditorSection;
  return Object.prototype.hasOwnProperty.call(HOSTED_FIELDS, head) ? HOSTED_FIELDS[head] : null;
}
