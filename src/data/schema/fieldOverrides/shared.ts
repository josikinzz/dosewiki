import type { FieldMeta, SectionKey } from "../types";

export type FieldOverride = Partial<Omit<FieldMeta, "path">> & {
  label: string;
  section: SectionKey;
};

export type FieldOverrideModule = Record<string, FieldOverride>;

export function defineFieldOverrides(overrides: FieldOverrideModule): FieldOverrideModule {
  return overrides;
}

export function mergeFieldOverrideModules(
  modules: Array<{ name: string; overrides: FieldOverrideModule }>,
): FieldOverrideModule {
  const merged: FieldOverrideModule = {};

  for (const overrideModule of modules) {
    for (const [path, override] of Object.entries(overrideModule.overrides)) {
      if (merged[path]) {
        throw new Error(`Duplicate field override for "${path}" detected in module "${overrideModule.name}"`);
      }
      merged[path] = override;
    }
  }

  return merged;
}
