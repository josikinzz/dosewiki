import { describe, expect, it } from "vitest";
import {
  applyEditableFieldWrite,
  EDITABLE_ARTICLE_FIELD_MAX_LENGTH,
  isEditableArticleFieldPath,
  parseEditableFieldPath,
} from "../server/lib/articleFieldWrites";

function documentFixture() {
  return {
    slug: "example",
    dosage: {
      routes: [
        {
          route: "oral",
          notes: "Original oral note.",
          dose_ranges: {
            threshold: { min: 5, max: null, unit: "mg" },
            light: { min: 10, max: 20, unit: "mg" },
          },
        },
      ],
    },
    tolerance: { full_tolerance: "Two weeks." },
    legality: {
      countries: {
        "United States": { status: "Schedule I", notes: "Federally prohibited." },
      },
    },
  } as Record<string, unknown>;
}

describe("editable article field paths", () => {
  it.each([
    ["comparisons[0]", "a field outside the allow-list"],
    ["dosage.routes[].notes", "template notation"],
    ["dosage", "a bare top-level key nobody may write"],
    ["dosage.routes[0].dose_ranges", "a whole subtree"],
    ["__proto__.polluted", "a prototype-pollution attempt"],
    ["dosage.routes[0].notes.constructor", "a constructor walk"],
    ["", "an empty path"],
  ])("rejects %s (%s)", (path) => {
    expect(isEditableArticleFieldPath(path)).toBe(false);
  });
});

describe("wildcard segments", () => {
  it.each([
    "legality.countries.__proto__.notes",
    "subjective_effects.sensory.constructor.note",
    "subjective_effects.sensory.prototype.note",
    "subjective_effects.physical.__proto__.note",
    "legality.usStates.Ohio.cities.__proto__.notes",
  ])("refuses %s", (path) => {
    expect(isEditableArticleFieldPath(path)).toBe(false);
    expect(parseEditableFieldPath(path)).toBeNull();
    expect(
      applyEditableFieldWrite(documentFixture(), path, "polluted"),
    ).toMatchObject({ ok: false });
  });

  it("refuses a reserved key that arrives percent-encoded", () => {
    const encoded = `legality.countries.%5F%5Fproto%5F%5F.notes`;
    expect(decodeURIComponent("%5F%5Fproto%5F%5F")).toBe("__proto__");
    expect(isEditableArticleFieldPath(encoded)).toBe(false);
  });

  it("leaves the prototype chain alone after a refused write", () => {
    const probe = {} as Record<string, unknown>;
    applyEditableFieldWrite(
      documentFixture(),
      "legality.countries.__proto__.notes",
      "polluted",
    );
    expect(probe.notes).toBeUndefined();
    expect(({} as Record<string, unknown>).notes).toBeUndefined();
  });
});

describe("applyEditableFieldWrite", () => {
  it("refuses a write whose expected value no longer matches the store", () => {
    const result = applyEditableFieldWrite(
      documentFixture(),
      "dosage.routes[0].notes",
      "Corrected insufflated note.",
      { expected: "Original insufflated note." },
    );

    expect(result).toMatchObject({ ok: false, conflict: true });
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

describe("range fields", () => {
  const LIGHT = "dosage.routes[0].dose_ranges.light";

  it.each<[unknown, string]>([
    [{ min: 10, max: 20 }, "a missing unit"],
    [{ min: "10", max: 20, unit: "mg" }, "a non-numeric bound"],
    [{ min: 10, max: 20, unit: "mg", extra: 1 }, "an unexpected key"],
    [{ min: Number.NaN, max: null, unit: "mg" }, "a non-finite bound"],
  ])("refuses %o (%s)", (value) => {
    expect(
      applyEditableFieldWrite(documentFixture(), LIGHT, value as never),
    ).toMatchObject({ ok: false });
  });

  it("compares the whole range when checking for a conflict", () => {
    const document = documentFixture();
    const next = { min: 12, max: 25, unit: "mg" };

    expect(
      applyEditableFieldWrite(document, LIGHT, next, {
        expected: { min: 10, max: 20, unit: "mg" },
      }).ok,
    ).toBe(true);
    expect(
      applyEditableFieldWrite(documentFixture(), LIGHT, next, {
        expected: { min: 10, max: 20, unit: "g" },
      }),
    ).toMatchObject({ ok: false, conflict: true });
  });
});
