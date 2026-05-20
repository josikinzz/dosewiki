/**
 * RHF-based Citations fields component.
 * Uses useFieldArray for citation management.
 */

import type { UseFieldArrayReturn } from "react-hook-form";

import type { SubstanceArticle } from "@/schema";
import { CitationArrayFieldsRHF } from "./CitationArrayFieldsRHF";

export type CitationsFieldsRHFProps = {
  idPrefix: string;
  citations: UseFieldArrayReturn<SubstanceArticle, "citations">;
  addCitation: () => void;
  removeCitation: (index: number) => void;
};

export function CitationsFieldsRHF({
  idPrefix: _idPrefix,
  citations,
  addCitation,
  removeCitation,
}: CitationsFieldsRHFProps) {
  return (
    <CitationArrayFieldsRHF
      items={citations}
      name="citations"
      roleLabel="Legacy further-reading links"
      itemLabel="Legacy link"
      addLabel="Add legacy further-reading link"
      nameLabel="Legacy link label"
      urlLabel="Legacy link URL"
      namePlaceholder="TripSit"
      helperText="Compatibility/fallback uncited resources. Structured references drive numbered citations."
      onAdd={addCitation}
      onRemove={removeCitation}
      icon="lucide:library"
    />
  );
}
