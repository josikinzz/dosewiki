import { describe, expect, it } from "vitest";
import { describeInchi, matchesTypedName } from "./chemistryDiff";

describe("describeInchi", () => {
  it("reads the formula and the tetrahedral stereo layer", () => {
    expect(
      describeInchi("InChI=1S/C10H15N/c1-9(11-2)8-10-6-4-3-5-7-10/h3-7,9,11H,8H2,1-2H3/t9-/m0/s1"),
    ).toEqual({ formula: "C10H15N", stereocentres: 1, stereoLayer: "t9-/m0/s1" });
  });

  it("counts every centre in the stereo layer", () => {
    expect(describeInchi("InChI=1S/C20H25N3O/c1-4/t14-,19-/m1/s1")).toMatchObject({
      stereocentres: 2,
      stereoLayer: "t14-,19-/m1/s1",
    });
  });

  it("reports no stereocentres for an achiral molecule", () => {
    expect(describeInchi("InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3")).toEqual({
      formula: "C2H6O",
      stereocentres: 0,
      stereoLayer: null,
    });
  });

  it("returns null for an empty or non-InChI string", () => {
    expect(describeInchi("")).toBeNull();
    expect(describeInchi("CCO")).toBeNull();
  });
});

describe("matchesTypedName", () => {
  it("ignores case and surrounding space", () => {
    expect(matchesTypedName("  mdma ", "MDMA")).toBe(true);
    expect(matchesTypedName("MDM", "MDMA")).toBe(false);
    expect(matchesTypedName("", "")).toBe(false);
  });
});
