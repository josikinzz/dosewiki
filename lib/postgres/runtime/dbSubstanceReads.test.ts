// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tableColumns } from "../schema.generated";
import { encodeDocumentValue } from "../documentCodec";
import { createEmptyArticle } from "../../../src/data/schema/defaults.generated";
import { projectLibraryInput } from "../../../src/data/projections/substanceReadProjections";
import { parsePublicSubstanceLibraryInputRecords } from "../../data/publicData.substanceContract";
import { QueryInitializer } from "./dbQuery";
import { toRow, type Doc, type SqlExecutor } from "./dbRows";
import { SubstanceProjectionReader } from "./dbSubstanceReads";

const database = new PGlite();
const executor: SqlExecutor = {
  statements: 0,
  async query(sql, params) {
    const result = await database.query<Record<string, unknown>>(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  },
};
const reader = new SubstanceProjectionReader(executor);
const generic = new QueryInitializer(executor, "substanceIndex", () => {});
const project = (row: Doc) => projectLibraryInput({ ...createEmptyArticle(), ...row });
const id = (suffix: string) => suffix.padStart(32, "0");
const documents = ["a", "f", "g", "z"].map((suffix, index) => ({
  ...createEmptyArticle(),
  _id: id(suffix),
  _creationTime: 100,
  id: index + 1,
  title: `Synthetic ${suffix}`,
  slug: index === 0 ? undefined : `synthetic-${suffix}`,
  priority: index === 1 ? "hide_for_now" : "normal",
  editorial_review: index === 1 ? null : { status: "completed", notes: "Private synthetic note" },
  harm_potential: { addiction_liability: "Synthetic liability", unused: "Unused prose" },
}));

beforeAll(async () => {
  const types = { text: "text", double: "double precision", jsonb: "jsonb", boolean: "boolean", bigint: "bigint", bytea: "bytea" };
  const fields = Object.keys(tableColumns.substanceIndex);
  await database.exec(`CREATE TABLE "substanceIndex" (${Object.entries(tableColumns.substanceIndex)
    .map(([field, spec]) => `"${field}" ${types[spec.kind]}`).join(", ")})`);
  for (const document of documents) {
    const row = toRow("substanceIndex", document);
    await database.query(`INSERT INTO "substanceIndex" (${fields.map((field) => `"${field}"`).join(", ")}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(", ")})`, fields.map((field) => row[field]));
  }
});
afterAll(() => database.close());

describe("ordinary substance library SQL pages", () => {
  it("preserves generic page cursors, lookahead, and projected library values", async () => {
    let cursor: string | undefined;
    const output: ReturnType<typeof parsePublicSubstanceLibraryInputRecords> = [];
    for (let index = 0; index < 3; index += 1) {
      const compact = await reader.getPublicSubstanceLibraryInputPage(cursor, 2);
      const full = await generic.paginate({ cursor: cursor ?? null, numItems: 2 });
      expect(compact.cursor).toBe(full.continueCursor);
      expect(compact.isDone).toBe(full.isDone);
      expect(compact.rows.map(project)).toEqual(full.page.map(project));
      output.push(...parsePublicSubstanceLibraryInputRecords(compact.rows.map(project)));
      cursor = compact.cursor;
    }
    expect(output.map((row) => row.slug)).toEqual(["synthetic-a", "synthetic-f", "synthetic-g", "synthetic-z"]);
    expect(output[1]).toMatchObject({ priority: "low", expert_reviewed: false });
    expect(JSON.parse(cursor ?? "{}")).toEqual({ _creationTime: 100, _id: id("z") });
  });

  it.each([
    "{}", "null", "[]", "broken", JSON.stringify({ _id: id("A"), _creationTime: 1 }),
    JSON.stringify({ _id: "short", _creationTime: 1 }),
    JSON.stringify({ _id: id("a"), _creationTime: "1" }),
    JSON.stringify(encodeDocumentValue({ _id: id("a"), _creationTime: Infinity })),
  ])("refuses an invalid cursor through the same Error contract as generic pagination", async (cursor) => {
    await expect(reader.getPublicSubstanceLibraryInputPage(cursor, 2)).rejects.toThrow(new Error("Invalid pagination cursor"));
    await expect(generic.paginate({ cursor, numItems: 2 })).rejects.toThrow(new Error("Invalid pagination cursor"));
  });

  it("builds the cursor from the decoded creation time", async () => {
    const stringTimeReader = new SubstanceProjectionReader({
      statements: 0,
      async query(sql, params) {
        const result = await executor.query(sql, params);
        return { ...result, rows: result.rows.map((row) => ({ ...row, _creationTime: String(row._creationTime) })) };
      },
    });
    const page = await stringTimeReader.getPublicSubstanceLibraryInputPage(undefined, 2);
    expect(JSON.parse(page.cursor)).toEqual({ _creationTime: 100, _id: id("f") });
    await expect(stringTimeReader.getPublicSubstanceLibraryInputPage(page.cursor, 2)).resolves.toMatchObject({ isDone: true });
  });

  it("decodes retained nested nulls and special values before the library parser filters malformed rows", async () => {
    const value = { nested: [null, NaN, Infinity, -Infinity, -0, 5n, new Uint8Array([1, 2]).buffer] };
    await database.query('UPDATE "substanceIndex" SET "identification" = $1::jsonb WHERE "_id" = $2', [JSON.stringify(encodeDocumentValue(value)), id("g")]);
    const page = await reader.getPublicSubstanceLibraryInputPage(JSON.stringify({ _creationTime: 100, _id: id("f") }), 1);
    expect(page.rows[0].identification).toEqual(value);
    await database.query('UPDATE "substanceIndex" SET "classification" = $1::jsonb WHERE "_id" = $2', [JSON.stringify({ psychoactive_class: "invalid" }), id("g")]);
    const malformed = await reader.getPublicSubstanceLibraryInputPage(JSON.stringify({ _creationTime: 100, _id: id("f") }), 1);
    expect(parsePublicSubstanceLibraryInputRecords(malformed.rows.map(project))).toEqual([]);
  });

  it("keeps the empty initial page cursor", async () => {
    await database.exec('DELETE FROM "substanceIndex"');
    expect(await reader.getPublicSubstanceLibraryInputPage(undefined, 2)).toEqual({ rows: [], cursor: "{}", isDone: true });
  });
});
