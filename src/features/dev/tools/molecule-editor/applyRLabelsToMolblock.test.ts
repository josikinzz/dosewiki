import { describe, expect, it } from "vitest";
import {
  convertTypedRGroups,
  normalizeClassMolblock,
  parseClassDummies,
  stripOclCustomLabelSgroups,
} from "./applyRLabelsToMolblock";
import {
  OCL_TYPED_R_EMISSION_RAW,
  RDKIT_PHENETHYLAMINE,
  R_LABELS,
} from "./classMolblockFixture";

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
    // no atom map) where a dummy used to sit: the tail must NOT be restored.
    const i = start + target.index;
    lines[i] = lines[i].slice(0, 31) + "C   0  0  0  0  0  0  0  0  0  0  0  0";
    const redrawn = lines.join("\n");
    expect(redrawn).not.toBe(RDKIT_PHENETHYLAMINE);

    const normalized = normalizeClassMolblock(redrawn, RDKIT_PHENETHYLAMINE, dummies);
    expect(normalized).toBe(redrawn);
    expect(parseClassDummies(normalized).map((d) => d.mapNum)).not.toContain(target.mapNum);
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
});
