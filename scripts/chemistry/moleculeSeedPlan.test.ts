import { describe, expect, it } from "vitest";

import { buildMoleculeSeedPlan } from "./moleculeSeedPlan";

describe("buildMoleculeSeedPlan", () => {
  it("selects only valid missing rows with string SMILES, sorted and limited", () => {
    const plan = buildMoleculeSeedPlan(
      [
        { slug: "zeta", title: "Zeta", identification: { smiles: " CCO " } },
        { slug: "stored", title: "Stored", identification: { smiles: "N" } },
        { slug: "alpha", title: "Alpha", identification: { smiles: "CC" } },
        { slug: "missing", title: "Missing", identification: {} },
        { slug: "Bad Slug", title: "Bad", identification: { smiles: "O" } },
        { slug: "object", title: "Object", identification: { smiles: { value: "C" } } },
      ],
      ["stored"],
      1,
    );

    expect(plan.candidates).toEqual([
      { slug: "alpha", title: "Alpha", smiles: "CC", smilesSource: "identification.smiles" },
    ]);
    expect(plan.summary).toEqual({
      totalArticles: 6,
      withSmiles: 4,
      gapFilled: 0,
      missingSmiles: 2,
      alreadyStored: 1,
      invalidSlug: 1,
      selected: 1,
    });
  });

  it("never includes an existing row", () => {
    const plan = buildMoleculeSeedPlan(
      [{ slug: "alpha", identification: { smiles: "CC" } }],
      ["alpha"],
    );

    expect(plan.candidates).toEqual([]);
    expect(plan.summary.alreadyStored).toBe(1);
  });

  it("falls back to gap-fill SMILES only when the article has none inline", () => {
    const plan = buildMoleculeSeedPlan(
      [
        { slug: "tobacco", title: "Tobacco", identification: {} },
        { slug: "inline", title: "Inline", identification: { smiles: "CC" } },
        { slug: "unmapped", title: "Unmapped", identification: {} },
      ],
      [],
      Number.POSITIVE_INFINITY,
      new Map([
        ["tobacco", "CN1CCC[C@H]1C2=CN=CC=C2"],
        ["inline", "SHOULD-NOT-WIN"],
      ]),
    );

    expect(plan.candidates).toEqual([
      { slug: "inline", title: "Inline", smiles: "CC", smilesSource: "identification.smiles" },
      { slug: "tobacco", title: "Tobacco", smiles: "CN1CCC[C@H]1C2=CN=CC=C2", smilesSource: "gap-fill" },
    ]);
    expect(plan.summary.gapFilled).toBe(1);
    expect(plan.summary.missingSmiles).toBe(1);
  });
});
