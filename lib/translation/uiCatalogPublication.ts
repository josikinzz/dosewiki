import { createHash } from "node:crypto";
import { UI_MESSAGE_DEFINITIONS } from "../../src/i18n/uiMessageDefinitions";
import { getUiCatalogGlossaryMisses, type UiCatalogGlossaryMiss, type UiCatalogPendingRefresh } from "./uiCatalogCompiler";

export type UiCatalogPublication = {
  compiledAt: string;
  catalogDigest: string;
  approvedUiDigest: string | null;
  approvedUiSource: "store" | "offline-unverified";
  sourceInventoryDigest: string;
  exactLabels: Record<string, { source: string; target: string; targetDigest: string }>;
  pendingRefresh?: Array<string | UiCatalogPendingRefreshView>;
  pendingRefreshStatus?: "refreshed" | "not-refreshed";
  qaGlossaryMisses?: UiCatalogGlossaryMiss[];
};

export type UiCatalogPendingRefreshView = { catalogKey: string; term: string | null; expectedTarget: string | null };

export function readPendingRefresh(publication: UiCatalogPublication | undefined): { refreshed: boolean; entries: Map<string, UiCatalogPendingRefreshView> } {
  const entries = new Map<string, UiCatalogPendingRefreshView>();
  if (!publication) return { refreshed: false, entries };
  const misses = new Map<string, UiCatalogGlossaryMiss>();
  for (const miss of publication.qaGlossaryMisses ?? []) if (!misses.has(miss.catalogKey)) misses.set(miss.catalogKey, miss);
  for (const entry of publication.pendingRefresh ?? []) {
    if (typeof entry === "string") {
      const miss = misses.get(entry);
      entries.set(entry, { catalogKey: entry, term: miss?.term ?? null, expectedTarget: miss?.expectedTarget ?? null });
    } else entries.set(entry.catalogKey, { catalogKey: entry.catalogKey, term: entry.term ?? null, expectedTarget: entry.expectedTarget ?? null });
  }
  const refreshed = (publication.pendingRefreshStatus ?? (publication.approvedUiSource === "store" ? "refreshed" : "not-refreshed")) === "refreshed";
  return { refreshed, entries };
}

export function nextPendingRefresh(input: {
  offline: boolean;
  previous: UiCatalogPublication | undefined;
  computed: readonly UiCatalogPendingRefresh[];
  catalog: Readonly<Record<string, string>>;
}): { pendingRefresh: UiCatalogPendingRefreshView[]; pendingRefreshStatus: "refreshed" | "not-refreshed" } {
  if (!input.offline) return { pendingRefresh: [], pendingRefreshStatus: "refreshed" };
  const next = new Map<string, UiCatalogPendingRefreshView>();
  for (const entry of readPendingRefresh(input.previous).entries.values()) {
    const target = input.catalog[entry.catalogKey];
    if (target === undefined || (entry.expectedTarget && target.includes(entry.expectedTarget))) continue;
    next.set(entry.catalogKey, entry);
  }
  for (const entry of input.computed) if (!next.has(entry.catalogKey)) next.set(entry.catalogKey, entry);
  return { pendingRefresh: [...next.values()], pendingRefreshStatus: "not-refreshed" };
}

export function getApprovedUiTranslationsDigest(values: Readonly<Record<string, string>>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
}

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
