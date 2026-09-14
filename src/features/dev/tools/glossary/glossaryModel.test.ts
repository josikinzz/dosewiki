import { describe, expect, it } from "vitest";

import { GLOSSARY_CATEGORIES, GlossaryCsvError, STATE_WORD, count, filterRows, glossaryToCsv, groupRows, parseGlossaryCsv, type GlossaryRow } from "./glossaryModel";

const row = (term: string, kind: string, status: GlossaryRow["status"] = "draft"): GlossaryRow => ({
  locale: "zh-Hans", term, target: "", kind, status, source: "model", reviewed_at: null, reviewed_by: null, retranslated_at: null, updated_at: 1,
});

describe("groupRows", () => {
  it("folds kinds into the categories a reviewer thinks in, in display order, dropping empty ones", () => {
    const groups = groupRows([
      row("Marquis", "reagent-name"),
      row("Euphoria", "effect-name", "approved"),
      row("Replication", "replication"),
      row("Threshold", "enum:dose-tier"),
      row("Visual Effects", "effect-category"),
    ]);

    expect(groups.map((group) => group.category.id)).toEqual(["effects", "replications", "article", "classes"]);
    expect(groups[0].rows.map((entry) => entry.term)).toEqual(["Euphoria", "Visual Effects"]);
  });

  it("counts drafts per category so the header can say what still needs a decision", () => {
    const [effects] = groupRows([
      row("Euphoria", "effect-name", "approved"),
      row("Anxiety", "effect-name"),
      row("Common", "frequency"),
    ]);

    expect(effects.rows).toHaveLength(3);
    expect(effects.draftCount).toBe(2);
  });

  it("keeps a kind no category names, including one an older drafter assigned, in a trailing Other group", () => {
    const groups = groupRows([row("Legacy term", "enum:retired-group"), row("Euphoria", "effect-name")]);

    expect(groups.map((group) => group.category.id)).toEqual(["effects", "other"]);
    expect(groups[1].rows[0].term).toBe("Legacy term");
  });

  it("names every kind the categories cover exactly once", () => {
    const kinds = GLOSSARY_CATEGORIES.flatMap((category) => category.kinds);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("filterRows", () => {
  it("matches the search against the English term or the rendering and honors the status filter", () => {
    const rows = [
      { ...row("Euphoria", "effect-name", "approved"), target: "欣快" },
      row("Anxiety", "effect-name"),
    ];

    expect(filterRows(rows, { status: "all", search: "欣" }).map((entry) => entry.term)).toEqual(["Euphoria"]);
    expect(filterRows(rows, { status: "draft", search: "" }).map((entry) => entry.term)).toEqual(["Anxiety"]);
    expect(filterRows(rows, { status: "approved", search: "anx" })).toEqual([]);
  });
});

describe("count", () => {
  it("pluralizes everything but exactly one", () => {
    expect(count(0, "term")).toBe("0 terms");
    expect(count(1, "term")).toBe("1 term");
    expect(count(3, "term")).toBe("3 terms");
  });

  it("takes an irregular plural", () => {
    expect(count(1, "entry", "entries")).toBe("1 entry");
    expect(count(2, "entry", "entries")).toBe("2 entries");
  });
});

describe("STATE_WORD", () => {
  it("never shows a reviewer the word draft", () => {
    expect(Object.values(STATE_WORD)).not.toContain("draft");
    expect(STATE_WORD.draft).toBe("unreviewed");
  });
});

describe("glossaryToCsv / parseGlossaryCsv", () => {
  it("writes a Unicode BOM, the header, and CRLF records with each term's definition last, quoting only what RFC 4180 requires", () => {
    const csv = glossaryToCsv([
      { ...row("Euphoria", "effect-name", "approved"), target: "欣快" },
      { ...row("Route", "route"), target: 'Say "IV", or 静注' },
    ], { Euphoria: "Intense well-being · not Bliss, its milder sibling" });

    expect(csv).toBe('\uFEFFterm,target,kind,status,gloss\r\nEuphoria,欣快,effect-name,approved,"Intense well-being · not Bliss, its milder sibling"\r\nRoute,"Say ""IV"", or 静注",route,draft,\r\n');
  });

  it("round-trips a target holding a comma, a quote, and a line break, and leaves the definition column behind on import", () => {
    const target = 'A, "B"\nC';
    const [parsed] = parseGlossaryCsv(glossaryToCsv([{ ...row("Euphoria", "effect-name"), target }], { Euphoria: "Intense well-being, unearned" }));

    expect(parsed).toEqual({ term: "Euphoria", target, kind: "effect-name", status: "draft" });
  });

  it("accepts LF and CRLF, a missing BOM, optional columns in any order, and skips blank lines", () => {
    const rows = parseGlossaryCsv("status,term,target,note\r\napproved,Euphoria,欣快,keep\n\n,Anxiety,焦虑\r\n");

    expect(rows).toEqual([
      { term: "Euphoria", target: "欣快", kind: "", status: "approved" },
      { term: "Anxiety", target: "焦虑", kind: "", status: "" },
    ]);
  });

  it("refuses a file without the header or with a row that has no term", () => {
    expect(() => parseGlossaryCsv("Euphoria,欣快\n")).toThrow(GlossaryCsvError);
    expect(() => parseGlossaryCsv("")).toThrow(GlossaryCsvError);
    expect(() => parseGlossaryCsv("term,target\n,欣快\n")).toThrow("Line 2 has no term.");
  });
});
