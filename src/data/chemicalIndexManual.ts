/**
 * Manual chemical class index dataset loader.
 */
import rawManualConfig from "./chemicalIndexManual.json";
import {
  parseManualConfig,
  type ManualIndexConfig,
  type NormalizedManualIndexConfig,
  type ManualCategoryDefinition,
  type ManualCategorySection,
  type ManualSectionLink,
  type ManualSectionLinkType,
  type NormalizedManualCategoryDefinition,
  type NormalizedManualCategorySection,
} from "./manualIndexLoader";

export type ManualChemicalIndexConfig = ManualIndexConfig;
export type NormalizedManualChemicalIndexConfig = NormalizedManualIndexConfig;

export type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualSectionLink,
  ManualSectionLinkType,
  NormalizedManualCategoryDefinition,
  NormalizedManualCategorySection,
};

export const chemicalIndexManualConfig: NormalizedManualIndexConfig = parseManualConfig(
  rawManualConfig as unknown as ManualIndexConfig,
);

