/**
 * How the translation glossary's stored kinds fold into reader-facing
 * categories. Shared by the Glossary tab and the public /glossary page, so it
 * carries no editor imports.
 *
 * The stored kind is the drafter's identifier ("enum:dose-tier"); the label
 * says where on the site the term comes from. Any kind no category names,
 * including one an older drafter assigned and the current one no longer does,
 * lands in the trailing "Other" group rather than vanishing.
 *
 * Labels are `msg()` keys: the mirror /glossary page renders them through
 * `t()`, so the UI catalog must find them here.
 */
import { msg } from "@/i18n/messages";

export type GlossaryCategory = { id: string; label: string; kinds: readonly string[] };

export const GLOSSARY_CATEGORIES: readonly GlossaryCategory[] = [
  { id: "effects", label: msg("Subjective Effect Index"), kinds: ["effect-name", "effect-category", "effect-subcategory", "frequency"] },
  { id: "replications", label: msg("Replications"), kinds: ["replication"] },
  { id: "site", label: msg("Site and index names"), kinds: ["site-name", "index-name", "section-heading"] },
  { id: "article", label: msg("Article labels and scales"), kinds: ["enum:dose-tier", "enum:duration-stage", "route", "enum:legal-status", "enum:risk-level", "enum:carcinogenicity-level", "enum:evidence-level", "enum:interaction-tier"] },
  { id: "classes", label: msg("Drug classes and reagents"), kinds: ["psychoactive-class", "chemical-class", "chemical-class-alias", "reagent-name"] },
  { id: "register", label: msg("Harm-reduction register"), kinds: ["register"] },
];

export const OTHER_CATEGORY: GlossaryCategory = { id: "other", label: msg("Other"), kinds: [] };

const KIND_LABELS: Record<string, string> = {
  "effect-name": msg("Effect"),
  "effect-category": msg("Effect category"),
  "effect-subcategory": msg("Effect subcategory"),
  frequency: msg("Frequency scale"),
  replication: msg("Replications"),
  "site-name": msg("Site name"),
  "index-name": msg("Index or tab"),
  "section-heading": msg("Section heading"),
  "enum:dose-tier": msg("Dose tier"),
  "enum:duration-stage": msg("Duration stage"),
  route: msg("Route of administration"),
  "enum:legal-status": msg("Legal status"),
  "enum:risk-level": msg("Risk level"),
  "enum:carcinogenicity-level": msg("Carcinogenicity level"),
  "enum:evidence-level": msg("Evidence level"),
  "enum:interaction-tier": msg("Interaction tier"),
  "psychoactive-class": msg("Psychoactive class"),
  "chemical-class": msg("Chemical class"),
  "chemical-class-alias": msg("Chemical class alias"),
  "reagent-name": msg("Reagent"),
  register: msg("Register word"),
};

/** A kind with no label shows its identifier, the honest fallback for a kind an older drafter assigned. */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

const CATEGORY_BY_KIND: Record<string, GlossaryCategory> = Object.fromEntries(
  GLOSSARY_CATEGORIES.flatMap((category) => category.kinds.map((kind) => [kind, category])),
);

/** Which category a stored kind folds into; a kind no category names falls back to Other. */
export function categoryForKind(kind: string): GlossaryCategory {
  return CATEGORY_BY_KIND[kind] ?? OTHER_CATEGORY;
}
