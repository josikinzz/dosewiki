import { describe, expect, it } from "vitest";
import { documentHash, documentToRow, encodeFloat, rowToDocument } from "./documentCodec";

/**
 * Simulates what `losslessSelectList` hands back from `pg`: scalars as JS
 * values, jsonb columns as their text form, SQL NULL as null.
 */
function readBack(row: Record<string, unknown>, jsonbColumns: string[]): Record<string, unknown> {
  const stored: Record<string, unknown> = { ...row };
  for (const column of jsonbColumns) {
    if (typeof stored[column] === "string") continue;
    stored[column] = stored[column] === null ? null : JSON.stringify(stored[column]);
  }
  return stored;
}

describe("Postgres document codec", () => {
  it("keeps an absent optional field distinct from an explicit null on an optional nullable column", () => {
    // citationEvidence.articleId is `optional(union(number, null))`, mapped to jsonb.
    const explicitNull = { _id: "a", _creationTime: 1, slug: "s", section: "x", claimKey: "k", referenceIds: [], status: "unverified", severity: "low", createdAt: "c", updatedAt: "u", articleId: null };
    const absent = { _id: "b", _creationTime: 1, slug: "s", section: "x", claimKey: "k", referenceIds: [], status: "unverified", severity: "low", createdAt: "c", updatedAt: "u" };

    const nullRow = documentToRow("citationEvidence", explicitNull).row;
    const absentRow = documentToRow("citationEvidence", absent).row;
    expect(nullRow.articleId).toBe("null");
    expect(absentRow.articleId).toBeNull();

    expect(rowToDocument("citationEvidence", readBack(nullRow, ["articleId", "referenceIds"]))).toHaveProperty("articleId", null);
    expect(rowToDocument("citationEvidence", readBack(absentRow, ["articleId", "referenceIds"]))).not.toHaveProperty("articleId");
  });

  it("round-trips special floats at the top level and leaves nested wrappers verbatim", () => {
    const nested = { $float: encodeFloat(Number.NaN) };
    const document = {
      _id: "d",
      _creationTime: 2,
      slug: "s",
      ownerEmail: "e",
      baseHash: "h",
      version: { $float: encodeFloat(-0) },
      updatedAt: "t",
      article: { score: nested, list: [1, "two", null] },
    };
    const { row } = documentToRow("articleDrafts", document);
    expect(Object.is(row.version, -0)).toBe(true);
    expect(row.article).toBe(JSON.stringify(document.article));

    const rebuilt = rowToDocument("articleDrafts", readBack(row, ["article"]));
    expect(rebuilt.version).toEqual({ $float: encodeFloat(-0) });
    expect(rebuilt.article).toEqual(document.article);
    expect(documentHash(rebuilt)).toBe(documentHash(document));
  });

  it("rejects a document missing a required field instead of storing a NULL", () => {
    expect(() => documentToRow("memberships", { _id: "m", _creationTime: 1, email: "x", createdAt: "c", updatedAt: "u" })).toThrow(/role/);
  });

  it("reports undeclared fields rather than dropping them silently", () => {
    const { unknownFields } = documentToRow("prompts", { _id: "p", _creationTime: 1, key: "k", content: "c", updatedAt: "u", extra: 1 });
    expect(unknownFields).toEqual(["extra"]);
  });

  it("hashes documents independent of key order", () => {
    expect(documentHash({ a: 1, b: { c: [1, 2], d: "x" } })).toBe(documentHash({ b: { d: "x", c: [1, 2] }, a: 1 }));
    expect(documentHash({ a: 1 })).not.toBe(documentHash({ a: 2 }));
  });
});
