import { describe, expect, it } from "vitest";
import {
  classAtomLabels,
  convertTypedRGroups,
  normalizeClassMolblock,
  parseClassDummies,
  parseOclCustomLabelSgroups,
  stripOclCustomLabelSgroups,
} from "./applyRLabelsToMolblock";
import {
  OCL_TYPED_R_EMISSION_RAW,
  RDKIT_PHENETHYLAMINE,
  R_LABELS,
} from "./classMolblockFixture";

// The exact DAT S-group shape OCL's toMolfile writes per custom label
// (verified empirically against openchemlib). `atom` is 1-based, as in MDL SAL.
const labelSgroup = (id: number, atom: number, text: string) =>
  [
    `M  STY  1   ${id} DAT`,
    `M  SLB  1   ${id}   ${id}`,
    `M  SAL   ${id}  1   ${atom}`,
    `M  SDT   ${id} NOSEARCH_OCL_CUSTOM_LABEL`,
    `M  SDD   ${id}     3.7500   -3.8971    DA    ALL  1       5`,
    `M  SED   ${id} ${text}`,
  ].join("\n");

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

  it("skips a former dummy index the user replaced with a real atom (count-preserving redraw)", () => {
    const dummies = parseClassDummies(RDKIT_PHENETHYLAMINE);
    const lines = RDKIT_PHENETHYLAMINE.split("\n");
    const start = lines.findIndex((l) => l.includes("V2000")) + 1;
    const target = dummies[0];
    // Same atom count, but the user's redraw put a plain carbon (zeroed tail,
    // no atom map) where a dummy used to sit — the tail must NOT be restored.
    const i = start + target.index;
    lines[i] = lines[i].slice(0, 31) + "C   0  0  0  0  0  0  0  0  0  0  0  0";
    const redrawn = lines.join("\n");
    expect(redrawn).not.toBe(RDKIT_PHENETHYLAMINE);

    const normalized = normalizeClassMolblock(redrawn, RDKIT_PHENETHYLAMINE, dummies);
    expect(normalized).toBe(redrawn);
    expect(parseClassDummies(normalized).map((d) => d.mapNum)).not.toContain(target.mapNum);
  });
});

describe("parseOclCustomLabelSgroups", () => {
  it("reads each displayed label keyed by 0-based atom index from a raw emission", () => {
    const labeled = RDKIT_PHENETHYLAMINE.replace(
      "M  END",
      `${labelSgroup(1, 1, "RN")}\n${labelSgroup(2, 4, "Rα")}\nM  END`,
    );
    expect(parseOclCustomLabelSgroups(labeled)).toEqual({ 0: "RN", 3: "Rα" });
  });

  it("ignores S-groups that are not OCL custom labels", () => {
    const foreign = "M  STY  1   3 SUP\nM  SAL   3  1   2\nM  SED   3 nope";
    const mixed = RDKIT_PHENETHYLAMINE.replace(
      "M  END",
      `${foreign}\n${labelSgroup(1, 1, "RN")}\nM  END`,
    );
    expect(parseOclCustomLabelSgroups(mixed)).toEqual({ 0: "RN" });
  });

  it("returns an empty map for label-free molblocks", () => {
    expect(parseOclCustomLabelSgroups(RDKIT_PHENETHYLAMINE)).toEqual({});
  });
});

describe("stripOclCustomLabelSgroups", () => {
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

describe("convertTypedRGroups", () => {
  // What the seam receives: the raw typed-R emission after the S-group strip.
  const STRIPPED = stripOclCustomLabelSgroups(OCL_TYPED_R_EMISSION_RAW);
  const ALLOWED = Object.keys(R_LABELS);

  it("rewrites an allowed typed R group to the canonical dummy and prunes its RGP pair", () => {
    const { molblock, converted } = convertTypedRGroups(STRIPPED, ALLOWED);
    expect(converted).toEqual({ 17: "8" });
    // canonical spelling: `*` symbol, group number in the mmm atom-map field
    expect(molblock).toContain(
      "    5.2500   -2.5981    0.0000 *   0  0  0  0  0  0  0  0  0  8  0  0",
    );
    // the pipeline's own parser recognizes the converted atom as an R position
    expect(parseClassDummies(molblock)).toContainEqual({ index: 17, mapNum: "8" });
    // R12 has no rLabels entry: still a visible typed R group, RGP pair kept
    expect(molblock).toContain(
      "    6.7500   -1.2990    0.0000 R#  0  0  0  0  0  0  0  0  0  0  0  0",
    );
    expect(molblock).toContain("M  RGP  1  19  12");
  });

  it("drops the RGP line entirely once every pair converts", () => {
    const { molblock, converted } = convertTypedRGroups(STRIPPED, [...ALLOWED, "12"]);
    expect(converted).toEqual({ 17: "8", 18: "12" });
    expect(molblock).not.toContain("M  RGP");
    expect(molblock).not.toContain("R#");
    expect(molblock).toContain(
      "    6.7500   -1.2990    0.0000 *   0  0  0  0  0  0  0  0  0 12  0  0",
    );
  });

  it("is the identity for molblocks without RGP lines", () => {
    expect(convertTypedRGroups(RDKIT_PHENETHYLAMINE, ALLOWED)).toEqual({
      molblock: RDKIT_PHENETHYLAMINE,
      converted: {},
    });
  });

  it("is the identity when no map numbers are allowed (substance emissions)", () => {
    expect(convertTypedRGroups(STRIPPED, [])).toEqual({ molblock: STRIPPED, converted: {} });
  });
});
