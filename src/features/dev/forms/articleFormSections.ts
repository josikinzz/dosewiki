import type { FieldError, FieldErrors, FieldPath } from "react-hook-form";

import type { SubstanceArticle } from "@/schema";

/**
 * Top-level article keys mapped onto the section card titles the editor sees.
 * A resolver error names a schema path; the notice has to name a place in the
 * form, or "validation failed" is unactionable.
 */
const ARTICLE_SECTION_LABELS: Record<string, string> = {
  id: "Overview",
  title: "Overview",
  priority: "Overview",
  index_categories: "Overview",
  identification: "Overview",
  classification: "Classification",
  summary: "Summary",
  dosage: "Dosage & Duration",
  duration: "Dosage & Duration",
  subjective_effects: "Subjective Effects",
  reagent_testing: "Reagent Testing",
  pharmacology: "Pharmacology",
  interactions: "Interactions",
  tolerance: "Tolerance",
  harm_potential: "Harm Potential",
  history_culture: "History & Culture",
  legality: "Legality",
  references: "References",
  comparisons: "Comparisons",
  section_gaps: "Section Gaps",
  source_citations: "Legacy Source Links",
  citations: "Legacy Further Reading",
  editorial_review: "Editorial Review",
};

const FIELD_ERROR_METADATA_KEYS: Record<string, true> = {
  message: true,
  type: true,
  types: true,
  ref: true,
  root: true,
};

const FIELD_SEGMENT_LABELS: Record<string, string> = {
  doi: "DOI",
  isbn: "ISBN",
  pmid: "PMID",
  url: "URL",
};

export interface InvalidArticleField {
  path: FieldPath<SubstanceArticle>;
  label: string;
  message: string;
}

function formatFieldPath(path: string[]): string {
  return path
    .map((segment, index) => {
      if (index === 0) {
        return ARTICLE_SECTION_LABELS[segment] ?? segment.replace(/_/g, " ");
      }
      if (/^\d+$/.test(segment)) {
        return `Item ${Number(segment) + 1}`;
      }
      if (FIELD_SEGMENT_LABELS[segment]) {
        return FIELD_SEGMENT_LABELS[segment];
      }
      return segment
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
    })
    .join(" \u203a ");
}

function collectInvalidFields(
  value: unknown,
  path: string[],
  fields: InvalidArticleField[],
): void {
  if (!value || typeof value !== "object") {
    return;
  }

  const error = value as Partial<FieldError> & Record<string, unknown>;
  if (typeof error.message === "string" && path.length > 0) {
    fields.push({
      path: path.join(".") as FieldPath<SubstanceArticle>,
      label: formatFieldPath(path),
      message: error.message,
    });
    return;
  }

  for (const [key, child] of Object.entries(error)) {
    if (FIELD_ERROR_METADATA_KEYS[key]) {
      continue;
    }
    collectInvalidFields(child, [...path, key], fields);
  }
}

export function describeInvalidFields(
  errors: FieldErrors<SubstanceArticle>,
): InvalidArticleField[] {
  const fields: InvalidArticleField[] = [];
  collectInvalidFields(errors, [], fields);
  return fields;
}


export function describeInvalidSections(
  errors: FieldErrors<SubstanceArticle>,
): string[] {
  const labels: string[] = [];

  for (const key of Object.keys(errors ?? {})) {
    const label = ARTICLE_SECTION_LABELS[key] ?? key.replace(/_/g, " ");
    if (!labels.includes(label)) {
      labels.push(label);
    }
  }

  return labels;
}

export function formatInvalidSectionsMessage(
  sections: string[],
  fields: InvalidArticleField[] = [],
): string {
  if (sections.length === 0) {
    return "The article form has validation errors. Review the highlighted fields before applying.";
  }

  const list =
    sections.length === 1
      ? sections[0]
      : `${sections.slice(0, -1).join(", ")} and ${sections[sections.length - 1]}`;
  const instruction = `Fix the highlighted fields in ${list} before applying this draft.`;

  if (fields.length === 0) {
    return instruction;
  }

  const visibleFields = fields.slice(0, 3);
  const details = visibleFields
    .map((field) => `${field.label}: ${field.message}`)
    .join("; ");
  const remaining = fields.length - visibleFields.length;

  return `${instruction} ${details}.${remaining > 0 ? ` ${remaining} more ${remaining === 1 ? "field needs" : "fields need"} attention.` : ""}`;
}
