import { describe, expect, it } from "vitest";

import { GlossaryCsvError, glossaryToCsv, parseGlossaryCsv, type GlossaryRow } from "./glossaryModel";

const row = (term: string, kind: string, status: GlossaryRow["status"] = "draft"): GlossaryRow => ({
  locale: "zh-Hans", term, target: "", kind, status, source: "model", reviewed_at: null, reviewed_by: null, retranslated_at: null, updated_at: 1, revision: "1:0", approved_target: null, review_provenance: status === "approved" ? "human_review" : "unreviewed",
});

describe("glossaryToCsv / parseGlossaryCsv", () => {
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
