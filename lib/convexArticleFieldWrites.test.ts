import { describe, expect, it } from "vitest";
import {
  applyEditableFieldWrite,
  EDITABLE_ARTICLE_FIELD_MAX_LENGTH,
  EDITABLE_ARTICLE_FIELD_TEMPLATES,
  isEditableArticleFieldPath,
  parseEditableFieldPath,
} from "../convex/lib/articleFieldWrites";

function documentFixture() {
  return {
    slug: "example",
    dosage: {
      routes: [
        { route: "oral", notes: "Original oral note." },
        { route: "insufflated", notes: "" },
      ],
    },
    tolerance: {
      full_tolerance: "Two weeks.",
      half_tolerance: "One week.",
      baseline_tolerance: "Three weeks.",
      cross_tolerance: ["LSD"],
    },
  } as Record<string, unknown>;
}

describe("editable article field paths", () => {
  it("accepts every allow-listed template in concrete form", () => {
    for (const template of EDITABLE_ARTICLE_FIELD_TEMPLATES) {
      const concrete = template.replace("[]", "[0]");
      expect(isEditableArticleFieldPath(concrete)).toBe(true);
    }
  });

  it("derives the template form from a concrete indexed path", () => {
    expect(parseEditableFieldPath("dosage.routes[7].notes")).toMatchObject({
      template: "dosage.routes[].notes",
      topLevelKey: "dosage",
    });
  });

  it.each([
    ["tolerance.cross_tolerance[0]", "a field outside the allow-list"],
    ["dosage.routes[].notes", "template notation"],
    ["dosage", "a bare top-level key"],
    ["dosage.routes[0].dose_ranges.light", "a nested object"],
    ["__proto__.polluted", "a prototype-pollution attempt"],
    ["dosage.routes[0].notes.constructor", "a constructor walk"],
    ["", "an empty path"],
  ])("rejects %s (%s)", (path) => {
    expect(isEditableArticleFieldPath(path)).toBe(false);
  });
});

describe("applyEditableFieldWrite", () => {
  it("writes an indexed route note and clones only the touched key", () => {
    const document = documentFixture();
    const before = document.dosage;

    const result = applyEditableFieldWrite(document, "dosage.routes[1].notes", "Fixed.");

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.topLevelKey).toBe("dosage");
    expect(result.topLevelValue).toEqual({
      routes: [
        { route: "oral", notes: "Original oral note." },
        { route: "insufflated", notes: "Fixed." },
      ],
    });
    // The stored document is untouched: only the returned clone changed.
    expect(document.dosage).toBe(before);
    expect((before as { routes: Array<{ notes: string }> }).routes[1].notes).toBe("");
  });

  it("writes a plain tolerance string", () => {
    const result = applyEditableFieldWrite(
      documentFixture(),
      "tolerance.half_tolerance",
      "About five days.",
    );

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.topLevelValue).toMatchObject({ half_tolerance: "About five days." });
  });

  it("refuses an out-of-range route index", () => {
    const result = applyEditableFieldWrite(documentFixture(), "dosage.routes[9].notes", "x");
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses a path outside the allow-list", () => {
    const result = applyEditableFieldWrite(documentFixture(), "slug.value", "x");
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses to flatten a non-string target", () => {
    const document = documentFixture();
    (document.tolerance as Record<string, unknown>).full_tolerance = { nested: true };
    const result = applyEditableFieldWrite(document, "tolerance.full_tolerance", "x");
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses a write whose expected value no longer matches the store", () => {
    const result = applyEditableFieldWrite(
      documentFixture(),
      "dosage.routes[0].notes",
      "Corrected insufflated note.",
      { expected: "Original insufflated note." },
    );

    expect(result).toMatchObject({ ok: false, conflict: true });
  });

  it("writes when the expected value still matches", () => {
    const result = applyEditableFieldWrite(
      documentFixture(),
      "dosage.routes[0].notes",
      "Corrected.",
      { expected: "Original oral note." },
    );

    expect(result.ok).toBe(true);
  });

  it("treats an absent field as the empty string when matching", () => {
    const document = documentFixture();
    delete (document.tolerance as Record<string, unknown>).half_tolerance;

    expect(
      applyEditableFieldWrite(document, "tolerance.half_tolerance", "x", {
        expected: "",
      }).ok,
    ).toBe(true);
    expect(
      applyEditableFieldWrite(document, "tolerance.half_tolerance", "x", {
        expected: "One week.",
      }),
    ).toMatchObject({ ok: false, conflict: true });
  });

  it("refuses an oversized value", () => {
    const result = applyEditableFieldWrite(
      documentFixture(),
      "tolerance.full_tolerance",
      "x".repeat(EDITABLE_ARTICLE_FIELD_MAX_LENGTH + 1),
    );
    expect(result).toMatchObject({ ok: false });
  });
});
