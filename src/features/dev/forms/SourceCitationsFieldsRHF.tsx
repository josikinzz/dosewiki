/**
 * RHF-based Source Citations fields component.
 * Uses useFieldArray for source citation management.
 */

import { useArticleFormContext } from "./ArticleFormContext";
import { CitationArrayFieldsRHF } from "./CitationArrayFieldsRHF";

export type SourceCitationsFieldsRHFProps = {
  idPrefix: string;
};

export function SourceCitationsFieldsRHF({
  idPrefix: _idPrefix,
}: SourceCitationsFieldsRHFProps) {
  const { sourceCitations, addSourceCitation, removeSourceCitation } = useArticleFormContext();

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
