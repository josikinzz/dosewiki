import { describe, expect, it } from "vitest";
import {
  classAtomLabels,
  normalizeClassMolblock,
  parseClassDummies,
} from "./applyRLabelsToMolblock";
import { RDKIT_PHENETHYLAMINE, R_LABELS } from "./classMolblockFixture";

describe("parseClassDummies", () => {
  it("finds every dummy atom and its atom-map number in a real RDKit molblock", () => {
    const dummies = parseClassDummies(RDKIT_PHENETHYLAMINE);
    expect(dummies).toHaveLength(8);
    expect(new Set(dummies.map((d) => d.mapNum))).toEqual(
      new Set(["2", "3", "4", "5", "6", "7", "8", "9"]),
    );
  });
});

describe("classAtomLabels", () => {
  it("maps atom indices to display labels", () => {
    const labels = classAtomLabels(parseClassDummies(RDKIT_PHENETHYLAMINE), R_LABELS);
    expect(Object.values(labels).sort()).toEqual(
      ["R2", "R3", "R4", "R5", "R6", "RN", "Ra", "Rb"].sort(),
    );
  });
});

describe("normalizeClassMolblock", () => {
  it("restores dummy chemistry tails while keeping edited coordinates", () => {
    const dummies = parseClassDummies(RDKIT_PHENETHYLAMINE);
    // simulate an OCL-style mangle: dummy symbols -> "?", atom maps zeroed
    const lines = RDKIT_PHENETHYLAMINE.split("\n");
    const start = lines.findIndex((l) => l.includes("V2000")) + 1;
    for (const d of dummies) {
      const i = start + d.index;
      lines[i] =
        lines[i].slice(0, 31) + "?  " + lines[i].slice(34).replace(/ {2}\d(?= {2}0 {2}0$)/, "  0");
    }
    const mangled = lines.join("\n");
    expect(mangled).not.toBe(RDKIT_PHENETHYLAMINE);

    const restored = normalizeClassMolblock(mangled, RDKIT_PHENETHYLAMINE, dummies);
    expect(restored).toBe(RDKIT_PHENETHYLAMINE);
  });

  it("leaves the molblock alone when the atom count changed (real edit)", () => {
    const dummies = parseClassDummies(RDKIT_PHENETHYLAMINE);
    const shrunk = RDKIT_PHENETHYLAMINE.replace(" 17 17", " 16 17");
    expect(normalizeClassMolblock(shrunk, RDKIT_PHENETHYLAMINE, dummies)).toBe(shrunk);
  });
});
