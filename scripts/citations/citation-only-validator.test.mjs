import { describe, expect, it } from "vitest";

import { validateCitationOnlyEdit } from "./citation-only-validator.mjs";
const knownReferenceIds = ["shulgin1991", "dea2cb"];

describe("citation-only edit validator", () => {
  it("accepts a marker-only edit", () => {
    const original = "2C-B is a Schedule I controlled substance in the United States.";
    const marked = "2C-B is a Schedule I controlled substance in the United States.[cite:dea2cb]";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.markerCount).toBe(1);
    expect(result.strippedValue).toBe(original);
  });

  it("rejects removing or relocating existing markers", () => {
    const original = "First claim.[cite:shulgin1991] Second claim.[cite:dea2cb]";
    const marked = "First claim. Second claim.[cite:shulgin1991]";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "existing_marker_removed_or_moved",
        path: "",
        referenceId: "shulgin1991",
      }),
      expect.objectContaining({
        code: "existing_marker_removed_or_moved",
        path: "",
        referenceId: "dea2cb",
      }),
    ]));
  });

  it("rejects a duplicated reference id in one marker cluster (double-insertion)", () => {
    const original = "Tolerance may develop with repeated use.";
    // Stripping markers yields the original either way, so text_changed cannot
    // catch this; the duplicate-cluster rule must.
    const marked = "Tolerance may develop with repeated use.[cite:dea2cb][cite:dea2cb]";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "duplicate_marker_in_cluster", referenceId: "dea2cb" }),
    );
  });

  it("rejects a whitespace change", () => {
    const original = "Tolerance may develop with repeated use.";
    const marked = "Tolerance may develop  with repeated use.[cite:dea2cb]";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "text_changed", severity: "error" }),
    ]);
    expect(result.diagnostics[0].message).toMatch(/differs at serialized index/);
  });

  it("rejects a punctuation or capitalization change", () => {
    const original = "Tolerance may develop with repeated use.";

    const punctuation = validateCitationOnlyEdit(original, "Tolerance may develop with repeated use![cite:dea2cb]", { knownReferenceIds });
    expect(punctuation.ok).toBe(false);
    expect(punctuation.diagnostics).toEqual([
      expect.objectContaining({ code: "text_changed" }),
    ]);

    const capitalization = validateCitationOnlyEdit(original, "tolerance may develop with repeated use.[cite:dea2cb]", { knownReferenceIds });
    expect(capitalization.ok).toBe(false);
    expect(capitalization.diagnostics).toEqual([
      expect.objectContaining({ code: "text_changed" }),
    ]);
  });

  it("rejects malformed markers and unknown references", () => {
    const original = "Tolerance may develop with repeated use.";

    const malformed = validateCitationOnlyEdit(original, "Tolerance may develop with repeated use.[cite:]", { knownReferenceIds });
    expect(malformed.ok).toBe(false);
    expect(malformed.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "malformed_marker" }),
    ]));

    const unknown = validateCitationOnlyEdit(original, "Tolerance may develop with repeated use.[cite:nope]", { knownReferenceIds });
    expect(unknown.ok).toBe(false);
    expect(unknown.diagnostics).toEqual([
      expect.objectContaining({ code: "unknown_reference", referenceId: "nope" }),
    ]);
  });

});
