import { describe, expect, it } from "vitest";

import {
  UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
  normalizeMechanisms,
  parseQualifiedMechanismLabel,
} from "./mechanismNormalization";

describe("parseQualifiedMechanismLabel", () => {
  it("splits a trailing parenthetical qualifier from the base label", () => {
    expect(parseQualifiedMechanismLabel("5-HT2A receptor agonist (partial agonist)")).toEqual({
      base: "5-HT2A receptor agonist",
      qualifier: "partial agonist",
      qualifierKey: "partial-agonist",
    });
  });

  it("returns the unqualified key when there is no parenthetical", () => {
    expect(parseQualifiedMechanismLabel("Dopamine releaser")).toEqual({
      base: "Dopamine releaser",
      qualifierKey: UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
    });
  });

  it("keeps labels whose parenthetical is not trailing intact", () => {
    expect(parseQualifiedMechanismLabel("NMDA (glutamate) antagonist")).toEqual({
      base: "NMDA (glutamate) antagonist",
      qualifierKey: UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
    });
  });

  it("treats a parenthetical-only label as unqualified", () => {
    expect(parseQualifiedMechanismLabel("(partial agonist)")).toEqual({
      base: "(partial agonist)",
      qualifierKey: UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
    });
  });

  it("handles blank input", () => {
    expect(parseQualifiedMechanismLabel("   ")).toEqual({
      base: "",
      qualifierKey: UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
    });
  });
});

describe("normalizeMechanisms", () => {
  it("normalizes labels into slugged mechanism records", () => {
    expect(normalizeMechanisms(["5-HT2A receptor agonist (partial agonist)"])).toEqual([
      {
        label: "5-HT2A receptor agonist (partial agonist)",
        base: "5-HT2A receptor agonist",
        slug: "5-ht2a-receptor-agonist",
        qualifier: "partial agonist",
        qualifierSlug: "partial-agonist",
      },
    ]);
  });

  it("removes citation markers before deriving labels and route slugs", () => {
    expect(
      normalizeMechanisms([
        "5-HT2A receptor agonist (partial)[cite:doi-10-1000-example]",
      ]),
    ).toEqual([
      {
        label: "5-HT2A receptor agonist (partial)",
        base: "5-HT2A receptor agonist",
        slug: "5-ht2a-receptor-agonist",
        qualifier: "partial",
        qualifierSlug: "partial",
      },
    ]);
  });

  it("omits qualifier fields for unqualified labels", () => {
    expect(normalizeMechanisms(["Dopamine releaser"])).toEqual([
      {
        label: "Dopamine releaser",
        base: "Dopamine releaser",
        slug: "dopamine-releaser",
        qualifier: undefined,
        qualifierSlug: undefined,
      },
    ]);
  });

  it("dedupes on slug plus qualifier key", () => {
    const result = normalizeMechanisms([
      "Dopamine releaser",
      "dopamine RELEASER",
      "Dopamine releaser (weak)",
      "Dopamine Releaser (Weak)",
    ]);

    expect(result.map((entry) => `${entry.slug}::${entry.qualifierSlug ?? "unqualified"}`)).toEqual([
      "dopamine-releaser::unqualified",
      "dopamine-releaser::weak",
    ]);
  });

  it("drops blank entries and entries whose base slugs to nothing", () => {
    expect(normalizeMechanisms(["", "   ", "!!!", "™ (agonist)"])).toEqual([]);
  });

  it("preserves input order of first occurrences", () => {
    const result = normalizeMechanisms([
      "Serotonin releaser",
      "Dopamine releaser",
      "Serotonin releaser",
    ]);
    expect(result.map((entry) => entry.slug)).toEqual([
      "serotonin-releaser",
      "dopamine-releaser",
    ]);
  });
});
