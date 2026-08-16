import { describe, expect, it } from "vitest";
import {
  DELIRIANT_SUBSTANCE_SLUGS,
  artistIdentityKey,
  planExclusions,
  selectTargetReplications,
} from "./restrict-deliriant-only-replications.mjs";

/** A substance article, carrying only the path the showcase derivation reads. */
function substance(slug, visualEffectNames) {
  return {
    slug,
    subjective_effects: {
      sensory: {
        visual: {
          subcategories: {
            hallucinatory: { effects: visualEffectNames.map((name) => ({ name })) },
          },
        },
      },
    },
  };
}

function replication(slug, fields = {}) {
  return { slug, type: "image", ...fields };
}

const EXTERNAL = "External hallucination";
const INTERNAL = "Internal hallucination";
const DRIFTING = "Drifting";

describe("DELIRIANT_SUBSTANCE_SLUGS", () => {
  it("is the explicit six-slug list, not a class match", () => {
    expect([...DELIRIANT_SUBSTANCE_SLUGS]).toEqual([
      "benzydamine",
      "datura",
      "dimenhydrinate",
      "diphenhydramine",
      "nutmeg",
      "scopolamine",
    ]);
  });
});

describe("selectTargetReplications", () => {
  it("matches both stored spellings of the deliriant artist", () => {
    const rows = [
      replication("cubist-park", { artist: "StasConstantine", effect_slug: "environmental-cubism" }),
      replication("dph-cevs", { artist: "Stas Constantine", effect_slug: "internal-hallucination" }),
      replication("acid-creek", { artist: "Symmetric Vision", effect_slug: "colour-shifting" }),
    ];
    expect(selectTargetReplications(rows).map((row) => row.slug)).toEqual([
      "cubist-park",
      "dph-cevs",
    ]);
    expect(artistIdentityKey("StasConstantine")).toBe(artistIdentityKey("Stas Constantine"));
  });

  it("matches the external-hallucination effect by owning slug and by tag", () => {
    const rows = [
      replication("living-room", { artist: "Unknown", effect_slug: "external-hallucination" }),
      replication("tagged-entity", {
        artist: "Someone Else",
        effect_slug: "autonomous-entity",
        effect_tags: ["external-hallucination"],
      }),
      replication("untagged", {
        artist: "Someone Else",
        effect_slug: "autonomous-entity",
        effect_tags: ["internal-hallucination"],
      }),
    ];
    expect(selectTargetReplications(rows).map((row) => row.slug)).toEqual([
      "living-room",
      "tagged-entity",
    ]);
  });

  it("never targets a row no showcase can publish", () => {
    const rows = [
      replication("eeg-trace", {
        role: "figure",
        artist: "Stas Constantine",
        effect_slug: "external-hallucination",
      }),
      replication("dph-audio", {
        type: "audio",
        artist: "Stas Constantine",
        effect_slug: "external-hallucination",
      }),
    ];
    expect(selectTargetReplications(rows)).toEqual([]);
  });
});

describe("planExclusions", () => {
  const target = replication("living-room", {
    artist: "Unknown",
    effect_slug: "external-hallucination",
  });

  it("excludes matching non-deliriants and leaves the deliriants alone", () => {
    const [plan] = planExclusions({
      targets: [target],
      substances: [
        substance("lsd", [EXTERNAL, DRIFTING]),
        substance("psilocybin-mushrooms", [EXTERNAL]),
        substance("datura", [EXTERNAL]),
        substance("diphenhydramine", [EXTERNAL]),
        substance("caffeine", [DRIFTING]),
      ],
      existingBySubstance: new Map(),
    });

    expect(plan.excludedSubstanceSlugs).toEqual(["lsd", "psilocybin-mushrooms"]);
    expect(plan.deliriantSubstanceSlugs).toEqual(["datura", "diphenhydramine"]);
    expect(plan.newlyExcluded).toEqual(["lsd", "psilocybin-mushrooms"]);
    expect(plan.alreadyExcluded).toEqual([]);
  });

  it("matches a substance through the replication's tags too", () => {
    const [plan] = planExclusions({
      targets: [
        replication("tagged-entity", {
          artist: "Someone Else",
          effect_slug: "autonomous-entity",
          effect_tags: ["internal-hallucination"],
        }),
      ],
      substances: [substance("lsd", [INTERNAL]), substance("caffeine", [DRIFTING])],
      existingBySubstance: new Map(),
    });

    expect(plan.excludedSubstanceSlugs).toEqual(["lsd"]);
  });

  it("carries a stored exclusion forward, even on a deliriant or an unmatched substance", () => {
    const [plan] = planExclusions({
      targets: [target],
      substances: [
        substance("lsd", [EXTERNAL]),
        substance("datura", [EXTERNAL]),
        substance("caffeine", [DRIFTING]),
      ],
      existingBySubstance: new Map([
        ["datura", { curated_slugs: [], removed_slugs: ["living-room"] }],
        ["caffeine", { curated_slugs: [], removed_slugs: ["living-room"] }],
        ["lsd", { curated_slugs: [], removed_slugs: ["some-other-replication"] }],
      ]),
    });

    // A full-set replace: omitting either stored exclusion would clear it.
    expect(plan.excludedSubstanceSlugs).toEqual(["caffeine", "datura", "lsd"]);
    expect(plan.alreadyExcluded).toEqual(["caffeine", "datura"]);
    expect(plan.newlyExcluded).toEqual(["lsd"]);
  });

  it("reports nothing new once the restriction is already stored", () => {
    const existingBySubstance = new Map([
      ["lsd", { curated_slugs: [], removed_slugs: ["living-room"] }],
    ]);
    const [plan] = planExclusions({
      targets: [target],
      substances: [substance("lsd", [EXTERNAL])],
      existingBySubstance,
    });

    expect(plan.excludedSubstanceSlugs).toEqual(["lsd"]);
    expect(plan.newlyExcluded).toEqual([]);
    expect(plan.alreadyExcluded).toEqual(["lsd"]);
  });

  it("predicts the curated pin a new exclusion drops", () => {
    const [plan] = planExclusions({
      targets: [target],
      substances: [substance("lsd", [EXTERNAL]), substance("dmt", [EXTERNAL])],
      existingBySubstance: new Map([
        ["lsd", { curated_slugs: ["acid-creek", "living-room"], removed_slugs: [] }],
      ]),
    });

    expect(plan.droppedCuratedPositions).toEqual([{ substance_slug: "lsd", position: 2 }]);
  });

  it("plans an empty set for a replication nothing matches", () => {
    const [plan] = planExclusions({
      targets: [
        replication("orphan", { artist: "Nobody", effect_slug: "external-hallucination" }),
      ],
      substances: [substance("caffeine", [DRIFTING]), substance("nutmeg", [EXTERNAL])],
      existingBySubstance: new Map(),
    });

    expect(plan.matchedSubstanceSlugs).toEqual(["nutmeg"]);
    expect(plan.excludedSubstanceSlugs).toEqual([]);
    expect(plan.newlyExcluded).toEqual([]);
    expect(plan.droppedCuratedPositions).toEqual([]);
  });
});
