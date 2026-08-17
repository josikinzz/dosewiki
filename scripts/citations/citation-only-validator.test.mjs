import { describe, expect, it } from "vitest";

import {
  stripCitationMarkers,
  stripCitationMarkersFromValue,
  strippedValuesEqual,
  validateCitationOnlyEdit,
} from "./citation-only-validator.mjs";

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

  it("accepts adjacent citation markers", () => {
    const original = "Tolerance may develop with repeated use.";
    const marked = "Tolerance may develop with repeated use.[cite:shulgin1991][cite:dea2cb]";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(true);
    expect(result.markers.map((marker) => marker.referenceId)).toEqual(["shulgin1991", "dea2cb"]);
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

  it("reports only newly added markers for evidence coverage", () => {
    const original = "First claim.[cite:shulgin1991] Second claim.";
    const marked = "First claim.[cite:shulgin1991] Second claim.[cite:dea2cb]";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(true);
    expect(result.newMarkers).toEqual([
      expect.objectContaining({ marker: "[cite:dea2cb]", referenceId: "dea2cb" }),
    ]);
  });

  it("rejects a duplicated reference id in one marker cluster (double-insertion)", () => {
    const original = "Tolerance may develop with repeated use.";
    // Stripping markers yields the original either way, so text_changed cannot
    // catch this — the duplicate-cluster rule must.
    const marked = "Tolerance may develop with repeated use.[cite:dea2cb][cite:dea2cb]";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "duplicate_marker_in_cluster", referenceId: "dea2cb" }),
    );
  });

  it("rejects an interleaved duplicated cluster (a][b][a][b])", () => {
    const original = "Tolerance may develop with repeated use.";
    const marked =
      "Tolerance may develop with repeated use.[cite:shulgin1991][cite:dea2cb][cite:shulgin1991][cite:dea2cb]";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.filter((d) => d.code === "duplicate_marker_in_cluster")).toHaveLength(2);
  });

  it("does not flag the same reference id used in two separate sentences", () => {
    const original = "First sentence here. Second sentence here.";
    const marked = "First sentence here.[cite:dea2cb] Second sentence here.[cite:dea2cb]";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
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

  it("rejects a marker inserted mid-word", () => {
    const original = "Tolerance may develop with repeated use.";
    const marked = "Toler[cite:dea2cb]ance may develop with repeated use.";

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "mid_word_marker", referenceId: "dea2cb" }),
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

  it("skips the reference check when no known reference ids are provided", () => {
    const original = "Tolerance may develop with repeated use.";
    const marked = "Tolerance may develop with repeated use.[cite:whatever]";

    const result = validateCitationOnlyEdit(original, marked);

    expect(result.ok).toBe(true);
  });

  it("validates nested structures and ignores object key order", () => {
    const original = {
      countries: { "United States": { status: "Schedule I", notes: "Controlled." } },
      international: ["Controlled under Schedule II."],
    };
    const marked = {
      international: ["Controlled under Schedule II.[cite:dea2cb]"],
      countries: { "United States": { notes: "Controlled.[cite:dea2cb]", status: "Schedule I" } },
    };

    const result = validateCitationOnlyEdit(original, marked, { knownReferenceIds, path: "legality" });

    expect(result.ok).toBe(true);
    expect(result.markers.map((marker) => marker.path)).toEqual([
      "legality.international[0]",
      "legality.countries.United States.notes",
    ]);
  });

  it("strips markers idempotently", () => {
    const marked = "Tolerance may develop[cite:shulgin1991] with repeated use.[cite:dea2cb]";
    const once = stripCitationMarkers(marked);

    expect(once).toBe("Tolerance may develop with repeated use.");
    expect(stripCitationMarkers(once)).toBe(once);

    const nested = { notes: [marked] };
    const strippedNested = stripCitationMarkersFromValue(nested);
    expect(strippedNested).toEqual({ notes: ["Tolerance may develop with repeated use."] });
    expect(stripCitationMarkersFromValue(strippedNested)).toEqual(strippedNested);
  });

  it("compares values marker-insensitively with strippedValuesEqual", () => {
    expect(strippedValuesEqual(
      { a: "Text.[cite:old]", b: 1 },
      { b: 1, a: "Text.[cite:new]" },
    )).toBe(true);
    expect(strippedValuesEqual({ a: "Text." }, { a: "Text" })).toBe(false);
  });
});
