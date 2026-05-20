/**
 * RHF-based Source Citations fields component.
 * Uses useFieldArray for source citation management.
 */

import type { UseFieldArrayReturn } from "react-hook-form";

import type { SubstanceArticle } from "@/schema";
import { CitationArrayFieldsRHF } from "./CitationArrayFieldsRHF";

export type SourceCitationsFieldsRHFProps = {
  idPrefix: string;
  sourceCitations: UseFieldArrayReturn<SubstanceArticle, "source_citations">;
  addSourceCitation: () => void;
  removeSourceCitation: (index: number) => void;
};

export function SourceCitationsFieldsRHF({
  idPrefix: _idPrefix,
  sourceCitations,
  addSourceCitation,
  removeSourceCitation,
}: SourceCitationsFieldsRHFProps) {
  return (
    <CitationArrayFieldsRHF
      items={sourceCitations}
      name="source_citations"
      roleLabel="Legacy primary source links"
      itemLabel="Legacy source"
      addLabel="Add legacy source link"
      nameLabel="Legacy source label"
      urlLabel="Legacy source URL"
      namePlaceholder="PsychonautWiki"
      helperText="Compatibility-only fallback data. Prefer structured references above for cited material."
      onAdd={addSourceCitation}
      onRemove={removeSourceCitation}
      icon="lucide:book-open"
    />
  );
}
