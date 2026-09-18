import { slugify } from "@/utils/slug";

import chemicalIndexManual from "@data/substances/chemicalIndexManual.json";

interface ManualChemicalClass {
  key: string;
  label: string;
  aliases?: string[];
}

const MANUAL_CLASSES = chemicalIndexManual.classes as ManualChemicalClass[];

/** Slug of any label/alias → curated chemical-class key (the index tab/hash). */
const aliasToKey = new Map<string, string>();
for (const cls of MANUAL_CLASSES) {
  for (const value of [cls.key, cls.label, ...(cls.aliases ?? [])]) {
    const slug = slugify(value);
    if (slug && !aliasToKey.has(slug)) {
      aliasToKey.set(slug, cls.key);
    }
  }
}

/** Curated chemical-class keys, in authored order. */
export const CHEMICAL_CLASS_KEYS: readonly string[] = MANUAL_CLASSES.map((cls) => cls.key);

/**
 * Resolve a raw chemical-class label (e.g. "Phenethylamine (substituted)") to
 * its curated Chemical Class Index key (e.g. "phenethylamine"), or null when the
 * label isn't part of a curated class (long-tail singletons).
 */
export function resolveChemicalClassKey(label: string): string | null {
  return aliasToKey.get(slugify(label)) ?? null;
}
