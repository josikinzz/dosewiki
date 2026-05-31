export {
  ARTICLE_SECTION_CATALOG,
  getCatalogSchemaSections,
  getCatalogSectionPromptDescriptors,
  type CatalogSectionPromptDescriptor,
  type CatalogSectionPromptKey,
  type SubstanceArticleFieldKey,
  type SubstanceEditorFormAdapter,
  type SubstancePublicRendererAdapter,
  type SubstanceSectionId,
  type SubstanceSectionManifestEntry,
  type SubstanceSectionPresenceContext,
} from "./sectionCatalog";

import {
  getSubstanceSectionManifestEntries,
  type SubstanceSectionManifestEntry,
} from "./sectionCatalog";

export const SUBSTANCE_SECTION_MANIFEST: readonly SubstanceSectionManifestEntry[] =
  getSubstanceSectionManifestEntries();

export function getPublicTocSectionEntries() {
  return SUBSTANCE_SECTION_MANIFEST.filter(
    (entry) => entry.public.visible && entry.public.toc,
  );
}

export function getEditorSectionEntries() {
  return SUBSTANCE_SECTION_MANIFEST.filter((entry) => entry.editor.visible).sort(
    (left, right) => (left.editor.order ?? 0) - (right.editor.order ?? 0),
  );
}
