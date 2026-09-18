import { describe, expect, it } from "vitest";

import {
  associationStateOf,
  associationStatesEqual,
  setAllAssociations,
  summarizeAssociations,
  toggleAssociation,
  type AssociationState,
  type ReplicationAssociation,
} from "./replicationAssociationModel";

function association(
  slug: string,
  overrides: Partial<ReplicationAssociation> = {},
): ReplicationAssociation {
  return {
    slug,
    title: slug.toUpperCase(),
    matchedVia: "specific_drug",
    effectSlug: "drifting",
    effectName: "Drifting",
    excluded: false,
    curatedPosition: null,
    ...overrides,
  };
}

const ROWS = [
  association("lsd"),
  association("psilocybin", { matchedVia: "drug_class", effectSlug: "tracers", excluded: true }),
  association("dmt", { curatedPosition: 1 }),
  association("mescaline", { curatedPosition: 2, excluded: true }),
];

const EMPTY: AssociationState = { excluded: [] };

describe("associationStateOf", () => {
  it("seeds the draft from the rows already excluded, in row order", () => {
    expect(associationStateOf(ROWS)).toEqual({ excluded: ["psilocybin", "mescaline"] });
  });

  it("yields an empty draft when nothing is excluded", () => {
    expect(associationStateOf([association("lsd"), association("dmt")])).toEqual({ excluded: [] });
  });

  it("copies defensively so mutating the draft cannot reach back into the rows", () => {
    const rows = [association("lsd", { excluded: true })];
    const state = associationStateOf(rows);

    state.excluded.push("dmt");

    expect(associationStateOf(rows)).toEqual({ excluded: ["lsd"] });
  });
});

describe("associationStatesEqual", () => {
  it("ignores order, because exclusion is membership and carries no sequence", () => {
    expect(associationStatesEqual({ excluded: ["a", "b"] }, { excluded: ["b", "a"] })).toBe(true);
    expect(associationStatesEqual({ excluded: ["b", "a"] }, { excluded: ["a", "b"] })).toBe(true);
  });

  it("treats two empty drafts as equal", () => {
    expect(associationStatesEqual(EMPTY, { excluded: [] })).toBe(true);
  });

  it("separates different membership in both directions", () => {
    expect(associationStatesEqual({ excluded: ["a"] }, { excluded: ["b"] })).toBe(false);
    expect(associationStatesEqual({ excluded: ["a", "b"] }, { excluded: ["a"] })).toBe(false);
    expect(associationStatesEqual({ excluded: ["a"] }, { excluded: ["a", "b"] })).toBe(false);
  });
});

describe("toggleAssociation", () => {
  it("appends the slug when unticking a drug", () => {
    expect(toggleAssociation({ excluded: ["lsd"] }, "dmt")).toEqual({ excluded: ["lsd", "dmt"] });
  });

  it("removes the slug when re-ticking a drug, leaving the rest in place", () => {
    expect(toggleAssociation({ excluded: ["lsd", "dmt", "mescaline"] }, "dmt")).toEqual({
      excluded: ["lsd", "mescaline"],
    });
  });

  it("never returns the same reference, since a toggle always changes membership", () => {
    const state: AssociationState = { excluded: ["lsd"] };

    expect(toggleAssociation(state, "dmt")).not.toBe(state);
    expect(toggleAssociation(state, "lsd")).not.toBe(state);
  });

  it("round-trips back to the original membership", () => {
    const once = toggleAssociation(EMPTY, "dmt");

    expect(associationStatesEqual(toggleAssociation(once, "dmt"), EMPTY)).toBe(true);
  });
});

describe("setAllAssociations", () => {
  it("excludes every listed slug without duplicating one already excluded", () => {
    expect(setAllAssociations({ excluded: ["psilocybin"] }, ROWS, true)).toEqual({
      excluded: ["psilocybin", "lsd", "dmt", "mescaline"],
    });
  });

  it("preserves an excluded slug that the listed rows do not mention", () => {
    const state: AssociationState = { excluded: ["ketamine"] };

    expect(setAllAssociations(state, [association("lsd")], true)).toEqual({
      excluded: ["ketamine", "lsd"],
    });
    expect(setAllAssociations(state, [association("lsd")], false)).toBe(state);
  });

  it("re-ticks only the listed slugs and leaves unlisted exclusions alone", () => {
    const state: AssociationState = { excluded: ["ketamine", "lsd", "dmt"] };

    expect(setAllAssociations(state, [association("lsd"), association("dmt")], false)).toEqual({
      excluded: ["ketamine"],
    });
  });

  it("returns the same reference when every listed slug is already excluded", () => {
    const state: AssociationState = { excluded: ["lsd", "dmt"] };

    expect(setAllAssociations(state, [association("lsd"), association("dmt")], true)).toBe(state);
  });

  it("returns the same reference when no listed slug is excluded", () => {
    const state: AssociationState = { excluded: ["ketamine"] };

    expect(setAllAssociations(state, [association("lsd")], false)).toBe(state);
  });

  it("returns the same reference for empty rows in either direction", () => {
    const state: AssociationState = { excluded: ["lsd"] };

    expect(setAllAssociations(state, [], true)).toBe(state);
    expect(setAllAssociations(state, [], false)).toBe(state);
  });
});

describe("summarizeAssociations", () => {
  it("counts every non-excluded automatic association as published", () => {
    expect(summarizeAssociations(ROWS, associationStateOf(ROWS))).toEqual({
      total: 4,
      showing: 2,
      excluded: 2,
      published: 2,
      curatedAtRisk: [],
    });
  });

  it("publishes every automatic association when none are excluded", () => {
    expect(summarizeAssociations(ROWS, EMPTY)).toEqual({
      total: 4,
      showing: 4,
      excluded: 0,
      published: 4,
      curatedAtRisk: [],
    });
  });

  it("publishes exact-drug and general-class rows without stored priority", () => {
    const rows = [association("lsd"), association("dmt", { matchedVia: "drug_class" })];
    const summary = summarizeAssociations(rows, EMPTY);

    expect(summary.showing).toBe(2);
    expect(summary.published).toBe(2);
  });

  it("drops a publication as soon as its drug is excluded", () => {
    const summary = summarizeAssociations(ROWS, toggleAssociation(EMPTY, "dmt"));

    expect(summary.showing).toBe(3);
    expect(summary.published).toBe(3);
  });

  it("counts zero for no rows at all", () => {
    expect(summarizeAssociations([], { excluded: ["lsd"] })).toEqual({
      total: 0,
      showing: 0,
      excluded: 0,
      published: 0,
      curatedAtRisk: [],
    });
  });

  it("ignores excluded slugs that are not rows here, so counts never exceed the total", () => {
    const summary = summarizeAssociations([association("lsd")], { excluded: ["lsd", "ketamine"] });

    expect(summary.total).toBe(1);
    expect(summary.excluded).toBe(1);
    expect(summary.showing).toBe(0);
  });

  it("flags a curated row this draft newly excludes, in row order", () => {
    const state = toggleAssociation(associationStateOf(ROWS), "dmt");
    const summary = summarizeAssociations(ROWS, state);

    expect(summary.excluded).toBe(3);
    expect(summary.showing).toBe(1);
    expect(summary.curatedAtRisk.map((row) => row.slug)).toEqual(["dmt"]);
  });

  it("does not flag a curated row that was already excluded before this draft", () => {
    const summary = summarizeAssociations(ROWS, associationStateOf(ROWS));

    expect(summary.excluded).toBe(2);
    expect(summary.curatedAtRisk).toEqual([]);
  });

  it("does not flag an uncurated row the draft excludes", () => {
    const summary = summarizeAssociations(ROWS, toggleAssociation(EMPTY, "lsd"));

    expect(summary.curatedAtRisk).toEqual([]);
  });

  it("stops flagging once a newly excluded curated row is re-ticked", () => {
    const dropped = toggleAssociation(EMPTY, "dmt");

    expect(summarizeAssociations(ROWS, dropped).curatedAtRisk).toHaveLength(1);
    expect(summarizeAssociations(ROWS, toggleAssociation(dropped, "dmt")).curatedAtRisk).toEqual([]);
  });

  it("lists several newly excluded curated rows in row order after a select-all", () => {
    const rows = [
      association("dmt", { curatedPosition: 2 }),
      association("lsd"),
      association("mescaline", { curatedPosition: 1 }),
      association("psilocybin", { curatedPosition: 3, excluded: true }),
    ];
    const summary = summarizeAssociations(rows, setAllAssociations(associationStateOf(rows), rows, true));

    expect(summary).toMatchObject({ total: 4, showing: 0, excluded: 4, published: 0 });
    expect(summary.curatedAtRisk.map((row) => row.slug)).toEqual(["dmt", "mescaline"]);
  });
});
