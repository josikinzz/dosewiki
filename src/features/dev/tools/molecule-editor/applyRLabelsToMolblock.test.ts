import { describe, expect, it } from "vitest";
import {
  classAtomLabels,
  normalizeClassMolblock,
  parseClassDummies,
  stripOclCustomLabelSgroups,
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

describe("stripOclCustomLabelSgroups", () => {
  // The exact DAT S-group shape OCL's toMolfile writes per custom label
  // (verified empirically against openchemlib).
  const labelSgroup = (id: number, atom: number, text: string) =>
    [
      `M  STY  1   ${id} DAT`,
      `M  SLB  1   ${id}   ${id}`,
      `M  SAL   ${id}  1   ${atom}`,
      `M  SDT   ${id} NOSEARCH_OCL_CUSTOM_LABEL`,
      `M  SDD   ${id}     3.7500   -3.8971    DA    ALL  1       5`,
      `M  SED   ${id} ${text}`,
    ].join("\n");

  it("removes exactly the custom-label S-groups OCL appends before M  END", () => {
    const labeled = RDKIT_PHENETHYLAMINE.replace(
      "M  END",
      `${labelSgroup(1, 1, "RN")}\n${labelSgroup(2, 4, "Rα")}\nM  END`,
    );
    expect(stripOclCustomLabelSgroups(labeled)).toBe(RDKIT_PHENETHYLAMINE);
  });

  it("keeps S-groups that are not OCL custom labels", () => {
    const foreign = "M  STY  1   3 SUP\nM  SAL   3  1   2";
    const mixed = RDKIT_PHENETHYLAMINE.replace(
      "M  END",
      `${foreign}\n${labelSgroup(1, 1, "RN")}\nM  END`,
    );
    expect(stripOclCustomLabelSgroups(mixed)).toBe(
      RDKIT_PHENETHYLAMINE.replace("M  END", `${foreign}\nM  END`),
    );
  });

  it("is the identity for molblocks without custom labels", () => {
    expect(stripOclCustomLabelSgroups(RDKIT_PHENETHYLAMINE)).toBe(RDKIT_PHENETHYLAMINE);
  });
});
