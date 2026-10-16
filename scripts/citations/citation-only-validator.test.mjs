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
});
