import "server-only";

import { cache } from "react";

import chemicalIndexManual from "../../src/data/indexes/chemicalIndexManual.json";
import moleculeSvgMappings from "../../src/data/mappings/moleculeSvgMappings.json";
import { getCategoryIcon } from "../../src/data/config/categoryIcons";
import { normalizeTaxonomyKey, parseQualifiedTaxonomyLabel } from "../../src/data/builders/taxonomy";
import type { SubstanceRecord } from "../../src/data/builders/contentBuilder";
import type { DosageCategoryGroup, DrugListEntry } from "../../src/data/builders/library";
import type { ChemicalClassIndexEntry } from "../../src/features/chemical-classes/types";
import { getPublicLibrary } from "./publicLibrary";

interface ManualChemicalClass {
  key: string;
  label: string;
  iconKey?: string;
  aliases?: string[];
  description?: string;
  representatives?: string[];
}

const MANUAL_CLASSES = chemicalIndexManual.classes as ManualChemicalClass[];

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

/**
 * Build the Chemical Class Index: each curated class with its substances grouped
 * into psychoactive-class panels. Computed from the authoritative public library
 * (Convex-backed) so it stays in sync with live substance data.
 */
export const getPublicChemicalClassIndex = cache(async (): Promise<ChemicalClassIndexEntry[]> => {
  const library = await getPublicLibrary();

  // alias/label slug -> curated class key
  const aliasToClassKey = new Map<string, string>();
  for (const cls of MANUAL_CLASSES) {
    const keys = [cls.key, cls.label, ...(cls.aliases ?? [])];
    for (const value of keys) {
      const slug = normalizeTaxonomyKey(value);
      if (slug && !aliasToClassKey.has(slug)) aliasToClassKey.set(slug, cls.key);
    }
  }

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

  const entries: ChemicalClassIndexEntry[] = [];
  for (const cls of MANUAL_CLASSES) {
    const records = Array.from(classRecords.get(cls.key)?.values() ?? []);
    if (records.length === 0) continue;

    // psychoactive panel key -> { label, drugs deduped by slug }
    const panelMap = new Map<string, { label: string; drugs: Map<string, DrugListEntry> }>();
    for (const record of records) {
      for (const bucket of resolvePanelBuckets(record)) {
        if (!panelMap.has(bucket.key)) panelMap.set(bucket.key, { label: bucket.label, drugs: new Map() });
        panelMap.get(bucket.key)!.drugs.set(record.slug, toDrugEntry(record));
      }
    }

    const panels: DosageCategoryGroup[] = Array.from(panelMap.entries())
      .map(([key, panel]) => ({
        key,
        name: panel.label,
        icon: getCategoryIcon(key),
        total: panel.drugs.size,
        drugs: Array.from(panel.drugs.values()).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => panelRank(a.key) - panelRank(b.key) || a.name.localeCompare(b.name));

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
      .map((record) => toMolecule(record.slug, record.name));
    const molecules = [...featured, ...rest];

    entries.push({
      key: cls.key,
      label: cls.label,
      icon: getCategoryIcon(cls.iconKey ?? "lucide:hexagon"),
      total: records.length,
      description: cls.description?.trim() || undefined,
      molecules,
      featuredCount: featured.length,
      panels,
    });
  }

  return entries.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
});
