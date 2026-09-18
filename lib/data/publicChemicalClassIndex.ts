import "server-only";

import { cache } from "react";

import chemicalIndexManual from "@data/substances/chemicalIndexManual.json";
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
import {
  classStructureOverrideImageUrl,
  getMoleculeOverrideIndex,
  moleculeOverrideImageUrl,
} from "./publicData.molecules";
import { getIndexLayoutByType } from "./publicData.layouts";
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

interface ChemicalClassComputation {
  rolledRecordsByClassKey: Map<string, SubstanceRecord[]>;
  treePayload: ChemicalClassTreePayload;
}

const MANUAL_CLASSES = chemicalIndexManual.classes as ManualChemicalClass[];
const MANUAL_CLASS_BY_KEY = new Map(MANUAL_CLASSES.map((cls) => [cls.key, cls]));
const CHEMICAL_CLASS_TREE = buildChemicalClassTree(MANUAL_CLASSES);

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

function buildMolecules(records: SubstanceRecord[], moleculeOverrides: Map<string, string>) {
  // Every class member with a published Postgres depiction; the structure panels
  // join these to substance rows by slug, so no sampling or ordering matters here.
  const molecules: Array<{ slug: string; name: string; url: string }> = [];
  for (const record of records) {
    const updatedAt = moleculeOverrides.get(record.slug);
    if (!updatedAt) continue;
    molecules.push({
      slug: record.slug,
      name: record.name,
      url: moleculeOverrideImageUrl(record.slug, updatedAt),
    });
  }
  return molecules;
}

function buildEntry(
  cls: ManualChemicalClass,
  records: SubstanceRecord[],
  moleculeOverrides: Map<string, string>,
): ChemicalClassIndexEntry {
  return {
    key: cls.key,
    label: cls.label,
    icon: getCategoryIcon(cls.iconKey ?? "lucide:hexagon"),
    total: records.length,
    description: cls.description?.trim() || undefined,
    molecules: buildMolecules(records, moleculeOverrides),
    panels: buildPanels(records),
  };
}

const getChemicalClassComputation = cache(async (): Promise<ChemicalClassComputation> => {
  const [library, psychoactiveLayout] = await Promise.all([
    getPublicLibrary(),
    getIndexLayoutByType("psychoactive"),
  ]);
  const homepageSubstanceSlugs = new Set(
    psychoactiveLayout?.categories.flatMap((category) => [
      ...category.drugs,
      ...category.sections.flatMap((section) => section.drugs),
    ]) ?? [],
  );
  const aliasToClassKey = buildAliasToClassKey();

  // classKey -> records (deduped by slug)
  const classRecords = new Map<string, Map<string, SubstanceRecord>>();
  for (const record of library.allSubstanceRecords) {
    if (record.isHidden || record.isDirectUrlOnly) continue;
    // Chemical-class index membership must be a subset of the homepage substance index.
    if (homepageSubstanceSlugs.size > 0 && !homepageSubstanceSlugs.has(record.slug)) continue;
    const matched = new Set<string>();
    for (const rawClass of record.chemicalClasses ?? []) {
      const classKey = aliasToClassKey.get(normalizeTaxonomyKey(rawClass));
      if (classKey) matched.add(classKey);
    }
    // Most-specific placement: legacy articles carry both a broad family tag
    // and the specific subclass tag (2C-B: "Phenethylamine" + "2C-x"). Listing
    // it under both would flood ancestor pages with subclass compounds, so a
    // match is dropped when a strictly more specific match exists below it.
    for (const classKey of matched) {
      const descendants = CHEMICAL_CLASS_TREE.descendantsOf(classKey);
      if (descendants.some((descendant) => matched.has(descendant))) continue;
      if (!classRecords.has(classKey)) classRecords.set(classKey, new Map());
      classRecords.get(classKey)!.set(record.slug, record);
    }
  }

  const recordsByClassKey = new Map<string, SubstanceRecord[]>();
  for (const cls of MANUAL_CLASSES) {
    recordsByClassKey.set(cls.key, Array.from(classRecords.get(cls.key)?.values() ?? []));
  }

  // classKey -> every visible record in the class's subtree (self + descendants,
  // deduped by slug, direct members first).
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
    rolledRecordsByClassKey,
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

    const [{ rolledRecordsByClassKey, treePayload }, moleculeOverrides] = await Promise.all([
      getChemicalClassComputation(),
      getMoleculeOverrideIndex(),
    ]);
    const cls = MANUAL_CLASS_BY_KEY.get(classKey)!;
    const entry = buildEntry(cls, rolledRecordsByClassKey.get(classKey) ?? [], moleculeOverrides);
    const parents = CHEMICAL_CLASS_TREE.parentsOf(classKey);
    const overrideUpdatedAt = moleculeOverrides.get(`class:${classKey}`);

    // Curated bioisosteres only (amphetamine <-> thiopropamine, 2C-x <-> scaline,
    // ...) — the sole lateral link; plain siblings are reached by walking up.
    const bioisosteres = (cls.bioisosteres ?? [])
      .filter((key) => MANUAL_CLASS_BY_KEY.has(key))
      .map((key) => toTreeSummary(key, treePayload.nodes))
      .sort((a, b) => b.rolledTotal - a.rolledTotal || a.label.localeCompare(b.label));

    return {
      ...entry,
      structureUrl: overrideUpdatedAt
        ? classStructureOverrideImageUrl(classKey, overrideUpdatedAt)
        : null,
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
