import { describe, expect, it } from "vitest";

import chemicalIndexManual from "@data/substances/chemicalIndexManual.json";
import { buildChemicalClassTree, type ChemicalClassNodeInput } from "./chemicalClassTree";

const fixture: ChemicalClassNodeInput[] = [
  { key: "root-a", label: "Root A" },
  { key: "child-a", label: "Child A", parents: ["root-a"] },
  { key: "root-b", label: "Root B" },
  { key: "shared", label: "Shared", parents: ["child-a", "root-b"] },
  { key: "leaf", label: "Leaf", parents: ["shared"] },
];

describe("buildChemicalClassTree", () => {
  it("builds roots, children, lineage, siblings, and deduped descendants in manual order", () => {
    const tree = buildChemicalClassTree(fixture);

    expect(tree.roots).toEqual(["root-a", "root-b"]);
    expect(tree.childrenOf("root-a")).toEqual(["child-a"]);
    expect(tree.childrenOf("root-b")).toEqual(["shared"]);
    expect(tree.childrenOf("child-a")).toEqual(["shared"]);
    expect(tree.lineageOf("leaf")).toEqual(["root-a", "child-a", "shared", "leaf"]);
    expect(tree.siblingsOf("shared")).toEqual([]);
    expect(tree.descendantsOf("root-a")).toEqual(["child-a", "shared", "leaf"]);
    expect(tree.descendantsOf("root-b")).toEqual(["shared", "leaf"]);
  });

  it("dedupes descendants reached through multiple branches", () => {
    const tree = buildChemicalClassTree([
      { key: "root", label: "Root" },
      { key: "a", label: "A", parents: ["root"] },
      { key: "b", label: "B", parents: ["root"] },
      { key: "shared", label: "Shared", parents: ["a", "b"] },
    ]);

    expect(tree.descendantsOf("root")).toEqual(["a", "b", "shared"]);
  });

  it("throws a descriptive error for duplicate keys", () => {
    expect(() =>
      buildChemicalClassTree([
        { key: "root", label: "Root" },
        { key: "root", label: "Duplicate" },
      ]),
    ).toThrow(/Duplicate chemical class key "root"/);
  });

  it("throws a descriptive error for unknown parents", () => {
    expect(() =>
      buildChemicalClassTree([{ key: "child", label: "Child", parents: ["missing"] }]),
    ).toThrow(/unknown parent "missing"/);
  });

  it("throws a descriptive error for cycles", () => {
    expect(() =>
      buildChemicalClassTree([
        { key: "a", label: "A", parents: ["b"] },
        { key: "b", label: "B", parents: ["a"] },
      ]),
    ).toThrow(/cycle detected/i);
  });

  it("validates the manual chemical class data", () => {
    const classes = chemicalIndexManual.classes as ChemicalClassNodeInput[];
    const tree = buildChemicalClassTree(classes);

    expect(tree.roots.length).toBeGreaterThan(0);

    for (const cls of classes) {
      expect(cls.label.trim()).toMatch(/\S+/);

      if (tree.parentsOf(cls.key).length > 0) {
        const lineage = tree.lineageOf(cls.key);
        expect(lineage[0]).toBeDefined();
        expect(tree.roots).toContain(lineage[0]);
        expect(lineage[lineage.length - 1]).toBe(cls.key);
      }
    }
  });

  it("keeps bioisosteres symmetric and pointing at real classes, and gives every class a structure", () => {
    const classes = chemicalIndexManual.classes as Array<
      ChemicalClassNodeInput & {
        bioisosteres?: string[];
        structure?: { smiles?: string };
      }
    >;
    const byKey = new Map(classes.map((cls) => [cls.key, cls]));

    for (const cls of classes) {
      // A generic R-group skeleton is rendered for every class.
      expect(cls.structure?.smiles?.trim()).toMatch(/\S+/);

      for (const other of cls.bioisosteres ?? []) {
        expect(other, `${cls.key} -> unknown bioisostere ${other}`).not.toBe(cls.key);
        const partner = byKey.get(other);
        expect(partner, `${cls.key} -> unknown bioisostere ${other}`).toBeDefined();
        // Symmetric: if A lists B, B must list A.
        expect(
          partner?.bioisosteres ?? [],
          `bioisostere ${cls.key} <-> ${other} is not symmetric`,
        ).toContain(cls.key);
      }
    }
  });
});
