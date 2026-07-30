/**
 * RHF-based Citations fields component.
 * Uses useFieldArray for citation management.
 */

import { useArticleFormContext } from "./ArticleFormContext";
import { CitationArrayFieldsRHF } from "./CitationArrayFieldsRHF";

export type CitationsFieldsRHFProps = {
  idPrefix: string;
};

export function CitationsFieldsRHF({ idPrefix: _idPrefix }: CitationsFieldsRHFProps) {
  const { citations, addCitation, removeCitation } = useArticleFormContext();

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
