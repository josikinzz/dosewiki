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

    expect(plan.candidates).toEqual([{ slug: "alpha", title: "Alpha", smiles: "CC" }]);
    expect(plan.summary).toEqual({
      totalArticles: 6,
      withSmiles: 4,
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
});
