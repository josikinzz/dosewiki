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

import type { IconName } from "@/components/common/Icon";

import {
  getSubstanceSectionManifestEntries,
  type SubstanceSectionId,
  type SubstanceSectionManifestEntry,
} from "./sectionCatalog";

export const SUBSTANCE_SECTION_MANIFEST: readonly SubstanceSectionManifestEntry[] =
  getSubstanceSectionManifestEntries();

export const SUBSTANCE_SECTION_ICONS = Object.fromEntries(
  SUBSTANCE_SECTION_MANIFEST.map((entry) => [entry.id, entry.icon]),
) as Record<SubstanceSectionId, IconName>;

export const ALWAYS_RENDERED_PUBLIC_SECTION_IDS: readonly string[] = [
  "dosage-duration",
  "subjective-effects",
  "pharmacology",
  "interactions",
  "tolerance",
  "harm-potential",
  "history-culture",
  "legality",
];

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
