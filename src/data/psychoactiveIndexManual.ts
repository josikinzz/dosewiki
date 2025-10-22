/**
 * Manual psychoactive index dataset loader.
 */
import rawManualConfig from "./psychoactiveIndexManual.json";
import {
  getManualCategoryByKey as getManualCategoryByKeyFromConfig,
  parseManualConfig,
  type ManualCategoryDefinition,
  type ManualCategorySection,
  type ManualIndexConfig,
  type ManualSectionLink,
  type ManualSectionLinkType,
  type NormalizedManualCategoryDefinition,
  type NormalizedManualCategorySection,
  type NormalizedManualIndexConfig,
} from "./manualIndexLoader";

export type ManualPsychoactiveIndexConfig = ManualIndexConfig;
export type NormalizedManualPsychoactiveIndexConfig = NormalizedManualIndexConfig;

export type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualSectionLink,
  ManualSectionLinkType,
  NormalizedManualCategoryDefinition,
  NormalizedManualCategorySection,
};

export const psychoactiveIndexManualConfig: NormalizedManualIndexConfig = parseManualConfig(
  rawManualConfig as unknown as ManualIndexConfig,
);

export const getManualCategoryByKey = (
  key: string,
): NormalizedManualCategoryDefinition | undefined => {
  return getManualCategoryByKeyFromConfig(psychoactiveIndexManualConfig, key);
};

