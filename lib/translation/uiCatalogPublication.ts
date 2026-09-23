import { createHash } from "node:crypto";
import { UI_MESSAGE_DEFINITIONS } from "../../src/i18n/uiMessageDefinitions";
import { getUiCatalogGlossaryMisses, type UiCatalogGlossaryMiss } from "./uiCatalogCompiler";

export type UiCatalogPublication = {
  compiledAt: string;
  catalogDigest: string;
  approvedUiDigest: string | null;
  approvedUiSource: "store" | "offline-unverified";
  sourceInventoryDigest: string;
  exactLabels: Record<string, { source: string; target: string; targetDigest: string }>;
  pendingRefresh?: string[];
  qaGlossaryMisses?: UiCatalogGlossaryMiss[];
};

export function getApprovedUiTranslationsDigest(values: Readonly<Record<string, string>>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
}

/** Compilation is evidence of a local artifact only, never proof of deployment. */
export function getUiCatalogCoverage(
  locale: string,
  catalog: Readonly<Record<string, string>>,
  approved: Readonly<Record<string, string>>,
  metadata?: UiCatalogPublication,
  inventory: Readonly<Record<string, { catalogKey: string }>> = Object.fromEntries(Object.keys(UI_MESSAGE_DEFINITIONS).map((id) => [id, { catalogKey: id }])),
  glossary: ReadonlyMap<string, string> = new Map(),
) {
  const ids = Object.keys(inventory);
  const missingIds = ids.filter((id) => !catalog[inventory[id].catalogKey]);
  const approvalMismatches = Object.keys(approved).filter((id) => catalog[id] !== approved[id]);
  return {
    locale,
    total: ids.length,
    translated: ids.length - missingIds.length,
    missingIds,
    approved: Object.keys(approved).length,
    approvalMismatches,
    glossaryMisses: getUiCatalogGlossaryMisses(catalog, glossary, approved),
    compiledAt: metadata?.compiledAt ?? null,
    approvedSnapshotCurrent: metadata?.approvedUiSource === "store"
      && metadata.approvedUiDigest === getApprovedUiTranslationsDigest(approved)
      && metadata.catalogDigest === getApprovedUiTranslationsDigest(catalog),
    liveVerified: false as const,
  };
}
