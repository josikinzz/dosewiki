import "server-only";

import { cache } from "react";

import chemicalIndexManual from "../../src/data/indexes/chemicalIndexManual.json";
import moleculeSvgMappings from "../../src/data/mappings/moleculeSvgMappings.json";
import { buildChemicalClassTree } from "../../src/data/builders/chemicalClassTree";
import { getCategoryIcon } from "../../src/data/config/categoryIcons";
import { normalizeTaxonomyKey, parseQualifiedTaxonomyLabel } from "../../src/data/builders/taxonomy";
import type { SubstanceRecord } from "../../src/data/builders/contentBuilder";
import type { DosageCategoryGroup, DrugListEntry } from "../../src/data/builders/library";
import type {
  ChemicalClassDetail,
  ChemicalClassIndexEntry,
  ChemicalClassTreeNode,
  ChemicalClassTreePayload,
} from "../../src/features/chemical-classes/types";
import { getPublicLibrary } from "./publicLibrary";

interface ManualChemicalClass {
  key: string;
  label: string;
  iconKey?: string;
  aliases?: string[];
  description?: string;
  representatives?: string[];
  parents?: string[];
  bioisosteres?: string[];
  structure?: { smiles: string; rLabels?: Record<string, string> };
}

/** The generic R-group skeleton URL for a class, if it has a `structure`. */
const classStructureUrl = (cls: ManualChemicalClass): string | undefined =>
  cls.structure?.smiles ? `/molecules/classes/${cls.key}.svg` : undefined;

interface ChemicalClassComputation {
  entries: ChemicalClassIndexEntry[];
  treePayload: ChemicalClassTreePayload;
}

const MANUAL_CLASSES = chemicalIndexManual.classes as ManualChemicalClass[];
const MANUAL_CLASS_BY_KEY = new Map(MANUAL_CLASSES.map((cls) => [cls.key, cls]));
const CHEMICAL_CLASS_TREE = buildChemicalClassTree(MANUAL_CLASSES);

/** Slugs that have a rendered molecule SVG (`/molecules/<slug>.svg`). */
const AVAILABLE_MOLECULE_SLUGS = new Set(
  (moleculeSvgMappings.mappings as { filename: string }[]).map((m) =>
    m.filename.replace(/\.svg$/i, ""),
  ),
);

const toMolecule = (slug: string, name: string) => ({
  slug,
  name,
  url: `/molecules/${slug}.svg`,
});

/**
 * Psychoactive labels that are umbrellas (they co-occur with the more specific
 * class and would otherwise duplicate every panel) — they never seed a panel.
 */
const PSYCHOACTIVE_PANEL_DROP = new Set(["hallucinogen", "entheogen", "not-psychoactive"]);

/**
 * Fold the noisy psychoactive-class labels (dose-qualified variants, the whole
 * GABAergic/sedative depressant cluster) into the substance-index panel
 * taxonomy so each chemical class shows clean, distinct panels.
 */
const PSYCHOACTIVE_PANEL_CANON: Record<string, { key: string; label: string }> = {
  psychedelic: { key: "psychedelic", label: "Psychedelic" },
  "atypical-hallucinogen": { key: "hallucinogen", label: "Atypical Hallucinogen" },
  dissociative: { key: "dissociative", label: "Dissociative" },
  deliriant: { key: "deliriant", label: "Deliriant" },
  entactogen: { key: "entactogen", label: "Entactogen" },
  empathogen: { key: "entactogen", label: "Entactogen" },
  stimulant: { key: "stimulant", label: "Stimulant" },
  eugeroic: { key: "stimulant", label: "Stimulant" },
  cannabinoid: { key: "cannabinoid", label: "Cannabinoid" },
  nootropic: { key: "nootropic", label: "Nootropic" },
  opioid: { key: "opioid", label: "Opioid" },
  depressant: { key: "depressant", label: "Depressant" },
  sedative: { key: "depressant", label: "Depressant" },
  anxiolytic: { key: "depressant", label: "Depressant" },
  gabaergic: { key: "depressant", label: "Depressant" },
  "muscle-relaxant": { key: "depressant", label: "Depressant" },
  anticonvulsant: { key: "depressant", label: "Depressant" },
  hypnotic: { key: "depressant", label: "Depressant" },
  antidepressant: { key: "antidepressant", label: "Antidepressant" },
  antipsychotic: { key: "antipsychotic", label: "Antipsychotic" },
  oneirogen: { key: "oneirogen", label: "Oneirogen" },
};

const PSYCHOACTIVE_PANEL_ORDER = [
  "psychedelic",
  "hallucinogen",
  "dissociative",
  "deliriant",
  "entactogen",
  "stimulant",
  "cannabinoid",
  "nootropic",
  "depressant",
  "opioid",
  "antidepressant",
  "antipsychotic",
  "oneirogen",
];

const panelRank = (key: string): number => {
  const index = PSYCHOACTIVE_PANEL_ORDER.indexOf(key);
  if (index !== -1) return index;
  if (key === "other") return PSYCHOACTIVE_PANEL_ORDER.length + 1;
  return PSYCHOACTIVE_PANEL_ORDER.length; // unknowns before the "other" catch-all
};

/** Resolve a substance's psychoactive labels into unique canonical panel buckets. */
function resolvePanelBuckets(record: SubstanceRecord): Array<{ key: string; label: string }> {
  const seen = new Map<string, { key: string; label: string }>();
  for (const raw of record.psychoactiveClasses ?? []) {
    const base = parseQualifiedTaxonomyLabel(raw).base.trim();
    if (!base) continue;
    const baseKey = normalizeTaxonomyKey(base);
    if (!baseKey || PSYCHOACTIVE_PANEL_DROP.has(baseKey)) continue;
    const canon = PSYCHOACTIVE_PANEL_CANON[baseKey] ?? { key: baseKey, label: base };
    if (!seen.has(canon.key)) seen.set(canon.key, canon);
  }
  // Opioids are CNS depressants too; keep the more specific Opioid panel and
  // drop the generic Depressant one so the same drugs don't list twice.
  if (seen.has("opioid")) seen.delete("depressant");
  if (seen.size === 0) seen.set("other", { key: "other", label: "Other" });
  return Array.from(seen.values());
}

const toDrugEntry = (record: SubstanceRecord): DrugListEntry => ({
  name: record.name,
  slug: record.slug,
  alias: record.aliases[0],
});

function buildAliasToClassKey() {
  const aliasToClassKey = new Map<string, string>();
  for (const cls of MANUAL_CLASSES) {
    const keys = [cls.key, cls.label, ...(cls.aliases ?? [])];
    for (const value of keys) {
      const slug = normalizeTaxonomyKey(value);
      if (slug && !aliasToClassKey.has(slug)) aliasToClassKey.set(slug, cls.key);
    }
  }
  return aliasToClassKey;
}

function buildPanels(records: SubstanceRecord[]): DosageCategoryGroup[] {
  const panelMap = new Map<string, { label: string; drugs: Map<string, DrugListEntry> }>();
  for (const record of records) {
    for (const bucket of resolvePanelBuckets(record)) {
      if (!panelMap.has(bucket.key)) panelMap.set(bucket.key, { label: bucket.label, drugs: new Map() });
      panelMap.get(bucket.key)!.drugs.set(record.slug, toDrugEntry(record));
    }
  }

  return Array.from(panelMap.entries())
    .map(([key, panel]) => ({
      key,
      name: panel.label,
      icon: getCategoryIcon(key),
      total: panel.drugs.size,
      drugs: Array.from(panel.drugs.values()).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => panelRank(a.key) - panelRank(b.key) || a.name.localeCompare(b.name));
}

/**
 * Broad ancestor classes (amine: ~250 members) would otherwise put hundreds of
 * lazy <img>s in the marquee; the client shuffles past the featured prefix
 * anyway, so a bounded random-ish sample reads identically.
 */
const MARQUEE_REST_CAP = 60;

function buildMolecules(
  cls: ManualChemicalClass,
  records: SubstanceRecord[],
  library: Awaited<ReturnType<typeof getPublicLibrary>>,
) {
  // Featured (curated) molecules first, then every other class member that has
  // an SVG. The client keeps the featured prefix and shuffles the rest.
  const featuredSlugs = (cls.representatives ?? []).filter((slug) =>
    AVAILABLE_MOLECULE_SLUGS.has(slug),
  );
  const featuredSet = new Set(featuredSlugs);
  const featured = featuredSlugs.map((slug) =>
    toMolecule(slug, library.allSubstancesBySlug.get(slug)?.name ?? slug),
  );
  const rest = records
    .filter((record) => AVAILABLE_MOLECULE_SLUGS.has(record.slug) && !featuredSet.has(record.slug))
    .map((record) => toMolecule(record.slug, record.name))
    .slice(0, MARQUEE_REST_CAP);

  return { molecules: [...featured, ...rest], featuredCount: featured.length };
}

function buildEntry(
  cls: ManualChemicalClass,
  records: SubstanceRecord[],
  library: Awaited<ReturnType<typeof getPublicLibrary>>,
): ChemicalClassIndexEntry {
  const { molecules, featuredCount } = buildMolecules(cls, records, library);

  return {
    key: cls.key,
    label: cls.label,
    icon: getCategoryIcon(cls.iconKey ?? "lucide:hexagon"),
    total: records.length,
    description: cls.description?.trim() || undefined,
    molecules,
    featuredCount,
    panels: buildPanels(records),
  };
}

const getChemicalClassComputation = cache(async (): Promise<ChemicalClassComputation> => {
  const library = await getPublicLibrary();
  const aliasToClassKey = buildAliasToClassKey();

  // classKey -> records (deduped by slug)
  const classRecords = new Map<string, Map<string, SubstanceRecord>>();
  for (const record of library.allSubstanceRecords) {
    if (record.isHidden || record.isLowPriority) continue;
    const matched = new Set<string>();
    for (const rawClass of record.chemicalClasses ?? []) {
      const classKey = aliasToClassKey.get(normalizeTaxonomyKey(rawClass));
      if (classKey) matched.add(classKey);
    }
    for (const classKey of matched) {
      if (!classRecords.has(classKey)) classRecords.set(classKey, new Map());
      classRecords.get(classKey)!.set(record.slug, record);
    }
  }

  const recordsByClassKey = new Map<string, SubstanceRecord[]>();
  for (const cls of MANUAL_CLASSES) {
    recordsByClassKey.set(cls.key, Array.from(classRecords.get(cls.key)?.values() ?? []));
  }

  // classKey -> every visible record in the class's subtree (self + descendants,
  // deduped by slug, direct members first so they lead the marquee).
  const rolledRecordsByClassKey = new Map<string, SubstanceRecord[]>();
  const rolledSlugsByClassKey = new Map<string, Set<string>>();
  for (const cls of MANUAL_CLASSES) {
    const seen = new Set<string>();
    const rolled: SubstanceRecord[] = [];
    for (const key of [cls.key, ...CHEMICAL_CLASS_TREE.descendantsOf(cls.key)]) {
      for (const record of recordsByClassKey.get(key) ?? []) {
        if (seen.has(record.slug)) continue;
        seen.add(record.slug);
        rolled.push(record);
      }
    }
    rolledRecordsByClassKey.set(cls.key, rolled);
    rolledSlugsByClassKey.set(cls.key, seen);
  }

  // Children ordered by rolled substance count (stable sort, so manual order
  // breaks ties) — the most-populated branches lead in tree and detail views.
  const byProminence = (keys: string[]) =>
    [...keys].sort(
      (a, b) => (rolledSlugsByClassKey.get(b)?.size ?? 0) - (rolledSlugsByClassKey.get(a)?.size ?? 0),
    );

  const nodes: Record<string, ChemicalClassTreeNode> = {};
  for (const cls of MANUAL_CLASSES) {
    nodes[cls.key] = {
      key: cls.key,
      label: cls.label,
      directTotal: recordsByClassKey.get(cls.key)?.length ?? 0,
      rolledTotal: rolledSlugsByClassKey.get(cls.key)?.size ?? 0,
      children: byProminence(CHEMICAL_CLASS_TREE.childrenOf(cls.key)),
      parents: CHEMICAL_CLASS_TREE.parentsOf(cls.key),
    };
  }

  return {
    // Detail entries roll up the whole subtree: a class page lists everything
    // structurally contained under it (grouped by psychoactive panels), so
    // ancestor pages like Amine populate automatically and `total` matches the
    // rolled counts shown in the lineage and tree.
    entries: MANUAL_CLASSES.map((cls) =>
      buildEntry(cls, rolledRecordsByClassKey.get(cls.key) ?? [], library),
    ),
    treePayload: {
      roots: [...CHEMICAL_CLASS_TREE.roots],
      nodes,
    },
  };
});

const toTreeSummary = (key: string, nodes: Record<string, ChemicalClassTreeNode>) => ({
  key,
  label: nodes[key]?.label ?? key,
  rolledTotal: nodes[key]?.rolledTotal ?? 0,
});

export const getPublicChemicalClassTreePayload = cache(async () => {
  const { treePayload } = await getChemicalClassComputation();
  return treePayload;
});

export const getPublicChemicalClassDetailPayload = cache(
  async (classKey: string): Promise<ChemicalClassDetail | null> => {
    if (!MANUAL_CLASS_BY_KEY.has(classKey)) return null;

    const { entries, treePayload } = await getChemicalClassComputation();
    const entry = entries.find((candidate) => candidate.key === classKey);
    if (!entry) return null;

    const cls = MANUAL_CLASS_BY_KEY.get(classKey)!;
    const parents = CHEMICAL_CLASS_TREE.parentsOf(classKey);

    // Curated bioisosteres only (amphetamine <-> thiopropamine, 2C-x <-> scaline,
    // ...) — the sole lateral link; plain siblings are reached by walking up.
    const bioisosteres = (cls.bioisosteres ?? [])
      .filter((key) => MANUAL_CLASS_BY_KEY.has(key))
      .map((key) => toTreeSummary(key, treePayload.nodes))
      .sort((a, b) => b.rolledTotal - a.rolledTotal || a.label.localeCompare(b.label));

    return {
      ...entry,
      structureUrl: classStructureUrl(cls),
      lineage: CHEMICAL_CLASS_TREE.lineageOf(classKey).map((key) => toTreeSummary(key, treePayload.nodes)),
      bioisosteres,
      children: (treePayload.nodes[classKey]?.children ?? []).map((key) =>
        toTreeSummary(key, treePayload.nodes),
      ),
      otherParents: parents.slice(1).map((key) => ({
        key,
        label: treePayload.nodes[key]?.label ?? key,
      })),
    };
  },
);
