import { describe, expect, it } from "vitest";

import * as normalization from "./normalization.js";
import {
  getLegacyAwareMechanismTags,
  hasPharmacologyContent,
  normalizePharmacologySection,
  normalizeRouteName,
  stripMarkdownCodeFences,
  type NormalizedPharmacologySection,
} from "./normalization.js";

type IsNever<T> = [T] extends [never] ? true : false;

const assertType = <T>(_value: T) => {};

const expectedNormalizationExports = [
  "getLegacyAwareMechanismTags",
  "hasPharmacologyContent",
  "normalizePharmacologySection",
  "normalizeRouteName",
  "stripMarkdownCodeFences",
] as const satisfies readonly (keyof typeof normalization)[];

type MissingNormalizationExports = Exclude<
  keyof typeof normalization,
  (typeof expectedNormalizationExports)[number]
>;

assertType<IsNever<MissingNormalizationExports>>(true);

const stripMarkdownCodeFencesContract: (text: string) => string = stripMarkdownCodeFences;
const normalizeRouteNameContract: (routeName: string) => string = normalizeRouteName;
const normalizePharmacologySectionContract: (
  rawPharmacology: unknown,
) => NormalizedPharmacologySection = normalizePharmacologySection;
const getLegacyAwareMechanismTagsContract: (rawPharmacology: unknown) => string[] =
  getLegacyAwareMechanismTags;
const hasPharmacologyContentContract: (rawPharmacology: unknown) => boolean =
  hasPharmacologyContent;

const representativeNormalizedSection = normalizePharmacologySectionContract({
  summary: "Acts primarily through monoamine systems.",
  route_bioavailability: {
    oral: "70%",
  },
  route_half_life_notes: {
    insufflated: "Highly variable.",
  },
  receptor_profile: [{ receptor: "5-HT2A", tag: "5-HT2A receptor agonist" }],
});

assertType<string>(stripMarkdownCodeFencesContract("```yaml\nsummary: test\n```"));
assertType<string>(normalizeRouteNameContract("oral"));
assertType<string>(representativeNormalizedSection.pharmacodynamics);
assertType<string | undefined>(representativeNormalizedSection.summary);
assertType<Record<string, string> | undefined>(
  representativeNormalizedSection.route_bioavailability,
);
assertType<Record<string, string> | undefined>(
  representativeNormalizedSection.route_half_life_notes,
);
assertType<string[]>(getLegacyAwareMechanismTagsContract(representativeNormalizedSection));
assertType<boolean>(hasPharmacologyContentContract(representativeNormalizedSection));

describe("normalization declaration contract", () => {
  it("keeps the declared public export list aligned with runtime exports", () => {
    expect(Object.keys(normalization).sort()).toEqual(
      [...expectedNormalizationExports].sort(),
    );
  });
});
