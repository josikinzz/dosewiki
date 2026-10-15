#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CANONICAL_ROUTES } from "@/data/builders/taxonomy";
import { effectNameAliasTables, resolveEffectNameAlias, type EffectLocation } from "@/data/effectNameAliases";
import chemicalIndexManual from "@data/substances/chemicalIndexManual.json";
import psychoactiveIndexManual from "@data/substances/psychoactiveIndexManual.json";
import { FIELD_REGISTRY } from "@/data/schema/fieldRegistry";
import {
  CARCINOGENICITY_LEVEL_CONFIG,
  EVIDENCE_LEVEL_CONFIG,
  RISK_LEVEL_CONFIG,
} from "@/features/article/components/sections/harm-potential/harmPotentialLabels";
import {
  DOSE_TIERS,
  DURATION_STAGES,
} from "@/features/article/components/sections/dosageDurationLabels";
import {
  antibioticFunctionLevelSchema,
  carcinogenicityLevelSchema,
  evidenceLevelSchema,
  riskLevelSchema,
} from "@/schema/substance/harm-potential";
import {
  CANONICAL_LEGAL_STATUSES,
  CANONICAL_STATUS_LABELS,
} from "@/schema/substance/legalStatuses";
import {
  ARTICLE_SECTION_CATALOG,
  SUBSTANCE_SECTION_IDS,
  getCatalogSchemaSections,
} from "@/schema/substance/sectionCatalog";

const OUTPUT_PATH = "notes-and-plans/exports/translation/registry/Layout.json";

type RegistryKind =
  | "section"
  | "schema-section"
  | "field"
  | "enum-value"
  | "psychoactive-category"
  | "chemical-class"
  | "effect-category"
  | "effect-alias";

interface RegistryItem {
  key: string;
  kind: RegistryKind;
  label?: string;
  description?: string;
  fields?: string[];
  machine: Record<string, unknown>;
}

const items: RegistryItem[] = [];

function push(item: RegistryItem): void {
  items.push(item);
}

const sectionCatalogById = new Map(ARTICLE_SECTION_CATALOG.map((entry) => [entry.id, entry]));
SUBSTANCE_SECTION_IDS.forEach((id, index) => {
  const entry = sectionCatalogById.get(id);
  if (!entry) {
    throw new Error(`Section id ${id} has no ARTICLE_SECTION_CATALOG entry`);
  }
  push({
    key: `section:${id}`,
    kind: "section",
    label: entry.label,
    fields: [...entry.articleFields],
    machine: {
      id,
      ordinal: index,
      icon: entry.icon,
      publicVisible: entry.public.visible,
      toc: entry.public.toc,
      renderer: "renderer" in entry.public ? entry.public.renderer : null,
      schemaSections: "schemaSections" in entry ? entry.schemaSections.map((section) => section.key) : [],
    },
  });
});

getCatalogSchemaSections().forEach((section, index) => {
  push({
    key: `schema-section:${section.key}`,
    kind: "schema-section",
    label: section.label,
    ...(section.description ? { description: section.description } : {}),
    fields: [...section.fields],
    machine: {
      sectionKey: section.key,
      ordinal: index,
      icon: section.icon,
      routeDependent: section.routeDependent ?? false,
      defaultCollapsed: section.defaultCollapsed ?? false,
    },
  });
});

Object.entries(FIELD_REGISTRY).forEach(([fieldPath, meta], index) => {
  push({
    key: `field:${fieldPath}`,
    kind: "field",
    label: meta.label,
    ...(meta.description ? { description: meta.description } : {}),
    machine: {
      path: fieldPath,
      ordinal: index,
      type: meta.type,
      section: meta.section,
      required: meta.required,
      routeDependent: meta.routeDependent ?? false,
    },
  });
});

interface EnumGroup {
  id: string;
  values: Array<{ value: string; label: string; note?: string }>;
}

const ENUM_GROUPS: EnumGroup[] = [
  {
    id: "legal-status",
    values: CANONICAL_LEGAL_STATUSES.map((value) => ({
      value,
      label: CANONICAL_STATUS_LABELS[value],
    })),
  },
  {
    id: "dose-tier",
    values: DOSE_TIERS.map(({ key, label }) => ({ value: key, label })),
  },
  {
    id: "duration-stage",
    values: DURATION_STAGES.map(({ key, label }) => ({ value: key, label })),
  },
  {
    id: "risk-level",
    values: riskLevelSchema.options.map((value) => ({
      value,
      label: RISK_LEVEL_CONFIG[value].label,
    })),
  },
  {
    id: "carcinogenicity-level",
    values: carcinogenicityLevelSchema.options.map((value) => ({
      value,
      label: CARCINOGENICITY_LEVEL_CONFIG[value].label,
    })),
  },
  {
    id: "evidence-level",
    values: evidenceLevelSchema.options.map((value) => ({
      value,
      label: EVIDENCE_LEVEL_CONFIG[value].label,
    })),
  },
  {
    id: "antibiotic-function-level",
    values: antibioticFunctionLevelSchema.options.map((value) => ({
      value,
      label: CARCINOGENICITY_LEVEL_CONFIG[value].label,
      note: "labelled from CARCINOGENICITY_LEVEL_CONFIG, as the renderer does",
    })),
  },
  {
    id: "route",
    values: CANONICAL_ROUTES.map((value) => ({
      value,
      label: value,
      note: "no label registry: the stored route string is authored prose, key emitted as label",
    })),
  },
];

for (const group of ENUM_GROUPS) {
  group.values.forEach(({ value, label, note }, index) => {
    push({
      key: `enum:${group.id}:${value}`,
      kind: "enum-value",
      label,
      machine: {
        enum: group.id,
        value,
        ordinal: index,
        ...(note ? { note } : {}),
      },
    });
  });
}

psychoactiveIndexManual.categories.forEach((category, index) => {
  push({
    key: `category:psychoactive:${category.key}`,
    kind: "psychoactive-category",
    label: category.label,
    ...(category.definition ? { description: category.definition } : {}),
    machine: {
      categoryKey: category.key,
      ordinal: index,
      icon: category.iconKey,
      sections: (category.sections ?? []).map((section) => section.key),
    },
  });

  (category.sections ?? []).forEach((section, sectionIndex) => {
    push({
      key: `category:psychoactive:${category.key}:section:${section.key}`,
      kind: "psychoactive-category",
      label: section.label,
      machine: {
        parentKey: `category:psychoactive:${category.key}`,
        sectionKey: section.key,
        ordinal: sectionIndex,
      },
    });
  });
});

chemicalIndexManual.classes.forEach((chemicalClass, index) => {
  push({
    key: `class:chemical:${chemicalClass.key}`,
    kind: "chemical-class",
    label: chemicalClass.label,
    ...(chemicalClass.description ? { description: chemicalClass.description } : {}),
    machine: {
      classKey: chemicalClass.key,
      ordinal: index,
      icon: chemicalClass.iconKey,
      aliases: chemicalClass.aliases ?? [],
      representatives: chemicalClass.representatives ?? [],
      parents: chemicalClass.parents ?? [],
      structure: chemicalClass.structure ?? null,
    },
  });
});

const { global: globalAliases, locationScoped, unlinked } = effectNameAliasTables;

for (const [aliasSlug, target] of Object.entries(globalAliases)) {
  push({
    key: `alias:${aliasSlug}`,
    kind: "effect-alias",
    machine: {
      alias: aliasSlug,
      target,
      route: resolveEffectNameAlias(aliasSlug) ?? null,
      scope: "global",
    },
  });
}

for (const [location, aliases] of Object.entries(locationScoped)) {
  for (const [aliasSlug, target] of Object.entries(aliases)) {
    push({
      key: `alias:${location}:${aliasSlug}`,
      kind: "effect-alias",
      machine: {
        alias: aliasSlug,
        target,
        route: resolveEffectNameAlias(aliasSlug, location as EffectLocation) ?? null,
        scope: "location",
        location,
      },
    });
  }
}

for (const aliasSlug of unlinked) {
  push({
    key: `alias:unlinked:${aliasSlug}`,
    kind: "effect-alias",
    machine: {
      alias: aliasSlug,
      target: null,
      route: null,
      scope: "unlinked",
    },
  });
}

const duplicates = new Set<string>();
const seen = new Set<string>();
for (const item of items) {
  if (seen.has(item.key)) duplicates.add(item.key);
  seen.add(item.key);
}
if (duplicates.size > 0) {
  throw new Error(`Duplicate registry keys: ${[...duplicates].join(", ")}`);
}

const counts: Record<string, number> = {};
for (const item of items) {
  counts[item.kind] = (counts[item.kind] ?? 0) + 1;
}

const document = {
  dataset: "Layout",
  generatedAt: new Date().toISOString(),
  count: items.length,
  counts,
  license: "CC0 1.0 (public domain)",
  source: "https://dose.wiki",
  items,
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputFile = path.join(repoRoot, OUTPUT_PATH);
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(document, null, 2)}\n`, "utf8");

console.log(`Wrote ${OUTPUT_PATH}`);
for (const [kind, total] of Object.entries(counts)) {
  console.log(`  ${kind.padEnd(22)} ${String(total).padStart(4)}`);
}
console.log(`  ${"total".padEnd(22)} ${String(items.length).padStart(4)}`);
