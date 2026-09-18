import type { SubstanceRecord } from "./contentBuilder";
import type { ClassificationDetail } from "./library";
import {
  buildAutoChemicalClassIndexGroups,
  buildAutoMechanismIndexGroups,
  buildClassificationLookups,
  buildEffectData,
  buildMechanismData,
  resolveClassificationDetail,
  type ClassificationAccumulator,
  type MechanismAccumulator,
} from "./libraryBuilderTaxonomy";

type EffectAccumulator = ReturnType<typeof buildEffectData>["effectMap"] extends Map<string, infer TValue>
  ? TValue
  : never;

export interface TaxonomyProjection {
  chemicalClassLookup: Map<string, ClassificationAccumulator>;
  psychoactiveClassLookup: Map<string, ClassificationAccumulator>;
  mechanismMap: Map<string, MechanismAccumulator>;
  mechanismSummaries: ReturnType<typeof buildMechanismData>["mechanismSummaries"];
  autoMechanismIndexGroups: ReturnType<typeof buildAutoMechanismIndexGroups>;
  effectMap: Map<string, EffectAccumulator>;
  effectSlugAliasMap: Map<string, string>;
  effectSummaries: ReturnType<typeof buildEffectData>["effectSummaries"];
  autoChemicalClassIndexGroups: ReturnType<typeof buildAutoChemicalClassIndexGroups>;
  getChemicalClassDetail: (identifier: string) => ClassificationDetail | null;
  getPsychoactiveClassDetail: (identifier: string) => ClassificationDetail | null;
}

export function projectTaxonomy(records: SubstanceRecord[]): TaxonomyProjection {
  const { chemicalClassLookup, psychoactiveClassLookup } = buildClassificationLookups(records);
  const { mechanismMap, mechanismSummaries } = buildMechanismData(records);
  const { effectMap, effectSummaries, effectSlugAliasMap } = buildEffectData(records);

  return {
    chemicalClassLookup,
    psychoactiveClassLookup,
    mechanismMap,
    mechanismSummaries,
    autoMechanismIndexGroups: buildAutoMechanismIndexGroups(mechanismMap),
    effectMap,
    effectSlugAliasMap,
    effectSummaries,
    autoChemicalClassIndexGroups: buildAutoChemicalClassIndexGroups(records),
    getChemicalClassDetail: (identifier) =>
      resolveClassificationDetail(identifier, chemicalClassLookup, "chemical"),
    getPsychoactiveClassDetail: (identifier) =>
      resolveClassificationDetail(identifier, psychoactiveClassLookup, "psychoactive"),
  };
}
