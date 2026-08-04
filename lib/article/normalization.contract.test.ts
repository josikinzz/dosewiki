import { describe, expect, it } from "vitest";

import * as normalization from "./normalization.mjs";
import {
  getLegacyAwareMechanismTags,
  hasHarmPotentialContent,
  hasPharmacologyContent,
  migratePharmacologyBindingSites,
  normalizePharmacologySection,
  normalizeRouteName,
  planBindingSiteMigration,
  remapBindingSiteEvidencePath,
  remapBindingSiteFieldPath,
  stripMarkdownCodeFences,
  type NormalizedPharmacologySection,
} from "./normalization.mjs";

type IsNever<T> = [T] extends [never] ? true : false;

const assertType = <T>(_value: T) => {};

const expectedNormalizationExports = [
  "getLegacyAwareMechanismTags",
  "hasHarmPotentialContent",
  "hasPharmacologyContent",
  "migratePharmacologyBindingSites",
  "normalizePharmacologySection",
  "normalizeRouteName",
  "planBindingSiteMigration",
  "remapBindingSiteEvidencePath",
  "remapBindingSiteFieldPath",
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
const hasHarmPotentialContentContract: (rawHarmPotential: unknown) => boolean =
  hasHarmPotentialContent;

const representativeNormalizedSection = normalizePharmacologySectionContract({
  summary: "Acts primarily through monoamine systems.",
  route_bioavailability: {
    oral: "70%",
  },
  route_half_life_notes: {
    insufflated: "Highly variable.",
  },
  binding_sites: [{ target: "5-HT2A", tag: "5-HT2A receptor agonist" }],
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
assertType<Record<string, unknown>>(
  migratePharmacologyBindingSites(representativeNormalizedSection),
);
assertType<string>(planBindingSiteMigration(representativeNormalizedSection).status);
assertType<unknown>(remapBindingSiteFieldPath("pharmacology.binding_sites"));
assertType<unknown>(remapBindingSiteEvidencePath({
  slug: "amphetamine",
  claimKey: "taar1-d-isomer-more-potent",
  fieldPath: "pharmacology.receptor_binding.TAAR1",
}));
assertType<boolean>(hasPharmacologyContentContract(representativeNormalizedSection));
assertType<boolean>(
  hasHarmPotentialContentContract({ addiction: { psychological: { description: "Reported." } } }),
);

describe("normalization declaration contract", () => {
  it("keeps the declared public export list aligned with runtime exports", () => {
    expect(Object.keys(normalization).sort()).toEqual(
      [...expectedNormalizationExports].sort(),
    );
  });
});

describe("hasHarmPotentialContent presence mirrors the renderer", () => {
  it("rejects the unknown-graded toxicity scaffold that renders no cards", () => {
    // Live shape of /2-chloroephenidine: empty addiction/psychosis/seizure plus
    // `unknown`-level carcinogenicity and antibiotic notes, which
    // ToxicitySubsection suppresses outright. The section must fall through to
    // the gap notice instead of rendering empty chrome.
    expect(
      hasHarmPotentialContent({
        addiction: {
          physical_dependence: { description: "", level: null },
          psychological: { description: "", level: null },
        },
        psychosis: { description: "", level: null },
        seizure: { description: "", level: null },
        toxicity: {
          antibiotic_function: {
            description: "Not studied for antimicrobial properties.",
            level: "unknown",
          },
          carcinogenicity: {
            description: "No carcinogenicity data available for this compound.",
            evidence: null,
            level: "unknown",
          },
          organ_toxicity: [],
        },
      }),
    ).toBe(false);
  });

  it("rejects no_evidence graded cards, which the renderer also suppresses", () => {
    expect(
      hasHarmPotentialContent({
        toxicity: {
          carcinogenicity: { description: "No evidence found.", level: "no_evidence" },
        },
      }),
    ).toBe(false);
  });

  it("rejects level-only risk and addiction blocks, which paint no rows", () => {
    expect(
      hasHarmPotentialContent({
        addiction: { psychological: { description: "", level: "moderate" } },
        psychosis: { description: "", level: "high" },
        seizure: { description: "   ", level: "low" },
      }),
    ).toBe(false);
  });

  it("rejects fields no harm-potential renderer reads", () => {
    expect(hasHarmPotentialContent({ toxicity: { other: "Stray legacy prose." } })).toBe(false);
    expect(
      hasHarmPotentialContent({
        toxicity: { carcinogenicity: { evidence: "limited", level: "unknown" } },
      }),
    ).toBe(false);
  });

  it("still counts graded cards the renderer does paint", () => {
    expect(
      hasHarmPotentialContent({
        toxicity: { carcinogenicity: { description: "", level: "possible" } },
      }),
    ).toBe(true);
    expect(
      hasHarmPotentialContent({
        toxicity: { antibiotic_function: { description: "Inhibits growth.", level: null } },
      }),
    ).toBe(true);
    expect(hasHarmPotentialContent({ toxicity: { carcinogenicity: "Legacy prose." } })).toBe(true);
  });

  it("still counts described content across current and legacy shapes", () => {
    expect(hasHarmPotentialContent({ summary: "Generally well tolerated." })).toBe(true);
    expect(
      hasHarmPotentialContent({ addiction: { psychological: { description: "Reported." } } }),
    ).toBe(true);
    expect(hasHarmPotentialContent({ addiction_liability: "Moderate." })).toBe(true);
    expect(hasHarmPotentialContent({ risks: { psychosis: "Documented case reports." } })).toBe(true);
    expect(
      hasHarmPotentialContent({ risks: { seizure: { description: "Dose dependent." } } }),
    ).toBe(true);
    expect(hasHarmPotentialContent({ toxicity: { ld50: "200 mg/kg (rat, oral)" } })).toBe(true);
    expect(
      hasHarmPotentialContent({ toxicity: { lethal_dosage: { ld50: [{ species: "rat" }] } } }),
    ).toBe(true);
    expect(
      hasHarmPotentialContent({ toxicity: { organ_toxicity: [{ system: "Hepatic" }] } }),
    ).toBe(true);
  });

  it("rejects empty, scaffold, and non-object inputs", () => {
    expect(hasHarmPotentialContent(undefined)).toBe(false);
    expect(hasHarmPotentialContent(null)).toBe(false);
    expect(hasHarmPotentialContent("harm")).toBe(false);
    expect(hasHarmPotentialContent({})).toBe(false);
    expect(hasHarmPotentialContent({ toxicity: { organ_toxicity: [], lethal_dosage: { ld50: [] } } })).toBe(
      false,
    );
  });
});
