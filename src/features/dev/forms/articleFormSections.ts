import type { FieldErrors } from "react-hook-form";

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

export function formatInvalidSectionsMessage(sections: string[]): string {
  if (sections.length === 0) {
    return "The article form has validation errors. Review the highlighted fields before applying.";
  }

  const list =
    sections.length === 1
      ? sections[0]
      : `${sections.slice(0, -1).join(", ")} and ${sections[sections.length - 1]}`;

  return `Fix the highlighted fields in ${list} before applying this draft.`;
}
