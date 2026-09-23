import { describe, expect, it } from "vitest";

import { detectProductionWriteSignals } from "./production-writer-detector.mjs";

describe("production writer detector", () => {
  it.each([
    ["arbitrary mutation receiver", "await db.mutation(api.items.save, payload)"],
    ["aliased client receiver", "const alias = client; await alias.mutation(fn, args)"],
    ["element-access mutation", "await transport['mutation'](fn, args)"],
    ["aliased mutation method", "const mutate = db.mutation; await mutate(fn, args)"],
  ])("detects %s", (_label, source) => {
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).toContain(
      "data-mutation",
    );
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("detects HTTP %s", (method) => {
    const source = `await request(url, { method: "${method}", body: payload })`;
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).toContain(
      "http-write",
    );
  });

  it("detects constructed HTTP methods", () => {
    const source = `
      const prefix = "PA";
      const method = prefix + "TCH";
      await fetch(url, { method, body: payload });
    `;
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).toContain(
      "http-write",
    );
  });

  it.each([
    ["truncate literal", `await client.query("TRUNCATE x")`],
    ["lowercase delete with leading whitespace", "await pool.query(`\n  delete from \"items\" WHERE id = $1`, [id])"],
    ["insert template with substitutions", "await conn.query(`INSERT INTO ${table} (a) VALUES ($1)`, [a])"],
    ["update through a named statement", `const sql = "UPDATE items SET a = 1"; await client.query(sql)`],
    ["concatenated statement", `const head = "DELETE FROM "; await client.query(head + table)`],
    ["element-access query", `await client["query"]("INSERT INTO x VALUES (1)")`],
  ])("detects a raw SQL write from a %s", (_label, source) => {
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).toContain(
      "raw-sql-write",
    );
  });

  it.each([
    ["select", `await client.query("SELECT * FROM items FOR UPDATE")`],
    ["transaction control", `await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE")`],
    ["function reference query", `await client.query(api.items.list, { limit: 5 })`],
    ["write keyword outside a query call", `const note = "DELETE FROM items"; console.log(note)`],
  ])("does not flag a %s as a raw SQL write", (_label, source) => {
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).not.toContain(
      "raw-sql-write",
    );
  });

  it("does not classify read-only HTTP requests", () => {
    const source = `await fetch(url, { method: "GET" })`;
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).toEqual([]);
  });
});
