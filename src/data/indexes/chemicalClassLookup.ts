import { slugify } from "@/utils/slug";

import chemicalIndexManual from "@data/substances/chemicalIndexManual.json";

interface ManualChemicalClass {
  key: string;
  label: string;
  aliases?: string[];
}

const MANUAL_CLASSES = chemicalIndexManual.classes as ManualChemicalClass[];

const aliasToKey = new Map<string, string>();
for (const cls of MANUAL_CLASSES) {
  for (const value of [cls.key, cls.label, ...(cls.aliases ?? [])]) {
    const slug = slugify(value);
    if (slug && !aliasToKey.has(slug)) {
      aliasToKey.set(slug, cls.key);
    }
  }
}

export const CHEMICAL_CLASS_KEYS: readonly string[] = MANUAL_CLASSES.map((cls) => cls.key);

export function resolveChemicalClassKey(label: string): string | null {
  return aliasToKey.get(slugify(label)) ?? null;
}
