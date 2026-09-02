import { getMoleculeOverrideIndex } from "./publicData.molecules";
import { getPublicSubstanceLookup } from "./publicData";

/**
 * Number of substance structures in the public molecule pack. Substance
 * depictions live in Convex `moleculeOverrides`; `class:` rows are chemical-class
 * Markush skeletons, not downloadable substance structures, and low-priority /
 * unlisted substances ship no molecule in the public pack.
 */
export async function getPublicMoleculePackCount(): Promise<number> {
  const [moleculeOverrideIndex, substanceLookup] = await Promise.all([
    getMoleculeOverrideIndex(),
    getPublicSubstanceLookup(),
  ]);
  const excludedSubstanceSlugs = new Set(
    substanceLookup.filter((entry) => entry.priority === "low").map((entry) => entry.slug),
  );
  let moleculeCount = 0;
  for (const slug of moleculeOverrideIndex.keys()) {
    if (!slug.startsWith("class:") && !excludedSubstanceSlugs.has(slug)) {
      moleculeCount += 1;
    }
  }
  return moleculeCount;
}
