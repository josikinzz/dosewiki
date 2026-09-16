import { describe, expect, it } from "vitest";
import {
  applyEditableFieldWrite,
  applyIupacNameWrite,
  EDITABLE_ARTICLE_FIELD_MAX_LENGTH,
  EDITABLE_ARTICLE_FIELD_TEMPLATES,
  encodeArticleFieldPathKey,
  isEditableArticleFieldPath,
  parseEditableFieldPath,
} from "../server/lib/articleFieldWrites";

/** One concrete instance of a template: `[]` → `[0]`, `*` → a sample key. */
export function concreteInstanceOf(template: string): string {
  return template
    .split(".")
    .map((segment) => (segment === "*" ? "sample_key" : segment.replace("[]", "[0]")))
    .join(".");
}

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
        { route: "insufflated", notes: "" },
      ],
    },
    tolerance: {
      full_tolerance: "Two weeks.",
      half_tolerance: "One week.",
      baseline_tolerance: "Three weeks.",
      cross_tolerance: ["LSD", "Psilocin"],
    },
    title: "Example",
    summary: "An example substance.",
    identification: {
      common_name: "Example",
      botanical_name: "",
      iupac_name: "Old systematic name",
    },
    legality: {
      international: ["Not scheduled under the 1971 Convention."],
      countries: {
        "United States": { status: "Schedule I", notes: "Federally prohibited." },
      },
      usStates: {
        Ohio: {
          status: "Illegal",
          notes: "Mirrors federal scheduling.",
          cities: { Cleveland: { status: "Illegal", notes: "No local carve-out." } },
        },
      },
      usStatesNote: "State law tracks the federal schedule.",
    },
    subjective_effects: {
      notes: { overview: "Broadly psychedelic.", physical: "", cognitive: "" },
      sensory: {
        visual: {
          note: "Strong open-eye geometry.",
          subcategories: { Enhancements: { note: "Colour enhancement.", effects: [] } },
        },
      },
      physical: { Stimulation: { note: "Mild.", effects: [] } },
      progressive_stages: { "1. Taking Off": { note: "Onset.", effects: [] } },
    },
    harm_potential: {
      addiction: { psychological: { level: "low", description: "Low." } },
      toxicity: {
        lethal_dosage: { notes: "No reliable LD50." },
        organ_toxicity: [
          { system: "Hepatic", findings: "None reported.", mechanism: "", notes: "" },
        ],
      },
    },
    history_culture: {
      content: "First synthesised in 1938.",
      sections: [
        {
          heading: "Discovery",
          content: "Discovered by accident.",
          subsections: [{ heading: "Bicycle Day", content: "1943." }],
        },
      ],
    },
  } as Record<string, unknown>;
}

describe("editable article field paths", () => {
  it("accepts every allow-listed template in concrete form", () => {
    for (const template of EDITABLE_ARTICLE_FIELD_TEMPLATES) {
      expect(isEditableArticleFieldPath(concreteInstanceOf(template))).toBe(true);
    }
  });

  it("derives the template form from a concrete indexed path", () => {
    expect(parseEditableFieldPath("dosage.routes[7].notes")).toMatchObject({
      template: "dosage.routes[].notes",
      topLevelKey: "dosage",
    });
  });

  it("accepts a single-segment path the allow-list names", () => {
    expect(isEditableArticleFieldPath("title")).toBe(true);
    expect(parseEditableFieldPath("summary")).toMatchObject({
      template: "summary",
      topLevelKey: "summary",
    });
  });

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
  it("matches a data-chosen record key", () => {
    expect(isEditableArticleFieldPath("legality.countries.Germany.notes")).toBe(true);
    expect(
      isEditableArticleFieldPath("subjective_effects.sensory.visual.note"),
    ).toBe(true);
    expect(
      isEditableArticleFieldPath(
        "subjective_effects.sensory.visual.subcategories.Colour_Enhancement.note",
      ),
    ).toBe(true);
  });

  it("carries a key the path grammar cannot spell literally", () => {
    const encoded = encodeArticleFieldPathKey("United States");
    expect(encoded).toBe("United%20States");

    const path = `legality.countries.${encoded}.notes`;
    expect(isEditableArticleFieldPath(path)).toBe(true);
    expect(parseEditableFieldPath(path)?.segments[2]).toEqual({
      key: "United States",
      index: null,
    });
  });

  it("encodes the separators that would otherwise split a segment", () => {
    // Progressive stage keys are numbered prose: "1. Taking Off".
    const encoded = encodeArticleFieldPathKey("1. Taking Off");
    expect(encoded).not.toContain(".");
    expect(
      parseEditableFieldPath(
        `subjective_effects.progressive_stages.${encoded}.note`,
      )?.segments[2].key,
    ).toBe("1. Taking Off");
  });

  it("does not let a wildcard stand in for an indexed segment", () => {
    expect(isEditableArticleFieldPath("legality.countries.Germany[0].notes")).toBe(
      false,
    );
  });

  // A `*` matches whatever key the client sends, and the walker assigns with
  // `cursor[key] = value`, so these are the paths that would turn one inline
  // edit into a runtime-wide prototype write.
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
  it("writes an indexed route note and clones only the touched key", () => {
    const document = documentFixture();
    const before = document.dosage;

    const result = applyEditableFieldWrite(document, "dosage.routes[1].notes", "Fixed.");

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.topLevelKey).toBe("dosage");
    expect(result.topLevelValue).toEqual({
      routes: [
        {
          route: "oral",
          notes: "Original oral note.",
          dose_ranges: {
            threshold: { min: 5, max: null, unit: "mg" },
            light: { min: 10, max: 20, unit: "mg" },
          },
        },
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

describe("single-segment writes", () => {
  it("patches just that one key", () => {
    const result = applyEditableFieldWrite(documentFixture(), "summary", "Rewritten.", {
      expected: "An example substance.",
    });

    expect(result).toMatchObject({
      ok: true,
      topLevelKey: "summary",
      topLevelValue: "Rewritten.",
    });
  });

  it("detects a conflict on a top-level scalar", () => {
    expect(
      applyEditableFieldWrite(documentFixture(), "title", "New", {
        expected: "Stale",
      }),
    ).toMatchObject({ ok: false, conflict: true });
  });

  it("writes a top-level scalar the article does not have yet", () => {
    const document = documentFixture();
    delete document.summary;
    expect(
      applyEditableFieldWrite(document, "summary", "First draft.", { expected: "" }),
    ).toMatchObject({ ok: true, topLevelValue: "First draft." });
  });

  it("refuses to flatten a bare key holding a subtree", () => {
    const document = documentFixture();
    document.title = { nested: true };
    expect(applyEditableFieldWrite(document, "title", "Example")).toMatchObject({
      ok: false,
      reason: 'Field "title" is not a text field.',
    });
  });
});

describe("applyIupacNameWrite", () => {
  it("updates only the cloned identification section", () => {
    const document = documentFixture();
    const before = document.identification;
    const result = applyIupacNameWrite(
      document,
      "New systematic name",
      "Old systematic name",
    );

    expect(result).toMatchObject({
      ok: true,
      topLevelKey: "identification",
      topLevelValue: {
        common_name: "Example",
        botanical_name: "",
        iupac_name: "New systematic name",
      },
    });
    expect(document.identification).toBe(before);
    expect(before).toMatchObject({ iupac_name: "Old systematic name" });
  });

  it("refuses a stale expected name", () => {
    expect(
      applyIupacNameWrite(documentFixture(), "New systematic name", "Stale name"),
    ).toMatchObject({ ok: false, conflict: true });
  });
});

describe("newly authorized leaves", () => {
  it("writes a country note addressed by an encoded key", () => {
    const path = `legality.countries.${encodeArticleFieldPathKey("United States")}.notes`;
    const result = applyEditableFieldWrite(documentFixture(), path, "Prohibited.", {
      expected: "Federally prohibited.",
    });

    expect(result).toMatchObject({ ok: true, topLevelKey: "legality" });
    const legality = (result as { topLevelValue: Record<string, never> }).topLevelValue;
    expect(legality).toMatchObject({
      countries: { "United States": { status: "Schedule I", notes: "Prohibited." } },
    });
  });

  it("writes a nested city note", () => {
    const result = applyEditableFieldWrite(
      documentFixture(),
      "legality.usStates.Ohio.cities.Cleveland.notes",
      "Decriminalized locally.",
    );
    expect(result).toMatchObject({ ok: true, topLevelKey: "legality" });
  });

  it("writes an international-status array entry", () => {
    const result = applyEditableFieldWrite(
      documentFixture(),
      "legality.international[0]",
      "Scheduled under the 1971 Convention.",
    );
    expect(result).toMatchObject({ ok: true });
    expect(
      (result as { topLevelValue: { international: string[] } }).topLevelValue
        .international,
    ).toEqual(["Scheduled under the 1971 Convention."]);
  });

  it("writes a cross-tolerance entry without disturbing its siblings", () => {
    const result = applyEditableFieldWrite(
      documentFixture(),
      "tolerance.cross_tolerance[1]",
      "Psilocybin",
      { expected: "Psilocin" },
    );
    expect(
      (result as { topLevelValue: { cross_tolerance: string[] } }).topLevelValue
        .cross_tolerance,
    ).toEqual(["LSD", "Psilocybin"]);
  });

  it("writes a progressive-stage note keyed by numbered prose", () => {
    const path = `subjective_effects.progressive_stages.${encodeArticleFieldPathKey(
      "1. Taking Off",
    )}.note`;
    expect(
      applyEditableFieldWrite(documentFixture(), path, "The come-up.", {
        expected: "Onset.",
      }),
    ).toMatchObject({ ok: true, topLevelKey: "subjective_effects" });
  });

  it("writes a sense note and a subcategory note", () => {
    expect(
      applyEditableFieldWrite(
        documentFixture(),
        "subjective_effects.sensory.visual.note",
        "Rewritten.",
      ),
    ).toMatchObject({ ok: true });
    expect(
      applyEditableFieldWrite(
        documentFixture(),
        "subjective_effects.sensory.visual.subcategories.Enhancements.note",
        "Rewritten.",
      ),
    ).toMatchObject({ ok: true });
  });

  it("writes an organ-toxicity leaf by index", () => {
    const result = applyEditableFieldWrite(
      documentFixture(),
      "harm_potential.toxicity.organ_toxicity[0].mechanism",
      "Oxidative stress.",
    );
    expect(result).toMatchObject({ ok: true, topLevelKey: "harm_potential" });
  });

  it("writes a history subsection body", () => {
    expect(
      applyEditableFieldWrite(
        documentFixture(),
        "history_culture.sections[0].subsections[0].content",
        "19 April 1943.",
        { expected: "1943." },
      ),
    ).toMatchObject({ ok: true, topLevelKey: "history_culture" });
  });

  it.each([
    ["legality.countries.United%20States.status", "a canonical status badge"],
    ["harm_potential.addiction.psychological.level", "a risk level"],
    ["harm_potential.toxicity.organ_toxicity[0].system", "an organ system label"],
    ["harm_potential.toxicity.carcinogenicity.description", "carcinogenicity prose"],
    ["identification.iupac_name", "an identifier the hero does not edit"],
  ])("still refuses %s (%s)", (path) => {
    expect(isEditableArticleFieldPath(path)).toBe(false);
  });
});

describe("range fields", () => {
  const LIGHT = "dosage.routes[0].dose_ranges.light";

  it("writes a dose range and leaves its siblings alone", () => {
    const document = documentFixture();
    const result = applyEditableFieldWrite(document, LIGHT, {
      min: 12,
      max: 25,
      unit: "mg",
    });

    expect(result).toMatchObject({ ok: true, topLevelKey: "dosage" });
    const routes = (result as { topLevelValue: { routes: Array<Record<string, never>> } })
      .topLevelValue.routes;
    expect(routes[0].dose_ranges).toEqual({
      threshold: { min: 5, max: null, unit: "mg" },
      light: { min: 12, max: 25, unit: "mg" },
    });
  });

  it("refuses a string where a range belongs, and a range where text belongs", () => {
    expect(applyEditableFieldWrite(documentFixture(), LIGHT, "10-20 mg")).toMatchObject({
      ok: false,
    });
    expect(
      applyEditableFieldWrite(documentFixture(), "tolerance.full_tolerance", {
        min: 1,
        max: 2,
        unit: "mg",
      }),
    ).toMatchObject({ ok: false });
  });

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

  it("treats an absent range as empty so a blank tier can be filled in", () => {
    const document = documentFixture();
    const result = applyEditableFieldWrite(
      document,
      "dosage.routes[0].dose_ranges.heavy",
      { min: 60, max: null, unit: "mg" },
      { expected: { min: null, max: null, unit: "" } },
    );
    expect(result).toMatchObject({ ok: true });
  });
});
