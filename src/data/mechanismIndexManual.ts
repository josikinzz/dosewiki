/**
 * Manual mechanism of action index dataset loader.
 */
import rawManualConfig from "./mechanismIndexManual.json";
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

export type ManualMechanismIndexConfig = ManualIndexConfig;
export type NormalizedManualMechanismIndexConfig = NormalizedManualIndexConfig;

export type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualSectionLink,
  ManualSectionLinkType,
  NormalizedManualCategoryDefinition,
  NormalizedManualCategorySection,
};

export const mechanismIndexManualConfig: NormalizedManualIndexConfig = parseManualConfig(
  rawManualConfig as unknown as ManualIndexConfig,
);

