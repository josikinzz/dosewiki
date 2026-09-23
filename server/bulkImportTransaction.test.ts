import { beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresClient, resolveFunction } from "../lib/postgres/runtime/client";
import { api, makeFunctionReference } from "../lib/postgres/runtime/api";
import { minimalArticle } from "../src/test/fixtures/articles";

vi.mock("server-only", () => ({}));
vi.mock("./lib/auth", () => ({ requireRole: vi.fn(async () => ({})) }));

type BulkTable = "tripReports" | "replications" | "substanceIndex";

// Internal mutations are absent from some generated API typings; operator
// scripts call them by name.
const tripReportsBulkImport = makeFunctionReference<"mutation">("tripReports:bulkImport");
const replicationsBulkImport = makeFunctionReference<"mutation">("replications:bulkImport");

/**
 * A pg client that keeps Postgres's transaction semantics for the statements
 * the bulk handlers send. After a failed statement the transaction is aborted:
 * every later statement fails with 25P02, and COMMIT quietly ends in ROLLBACK,
 * so only rows staged in a transaction that commits cleanly persist.
 */
function fakePostgres({ failInsertNumber }: { failInsertNumber?: number } = {}) {
  const persisted: BulkTable[] = [];
  let staged: BulkTable[] = [];
  let aborted = false;
  let inserts = 0;
  const statements: string[] = [];
  const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });
  const query = vi.fn(async (statement: string) => {
    statements.push(statement);
    if (statement.startsWith("BEGIN")) {
      staged = [];
      aborted = false;
      return { rows: [], rowCount: null };
    }
    if (statement === "ROLLBACK" || statement === "COMMIT") {
      const command = aborted ? "ROLLBACK" : statement;
      if (command === "COMMIT") persisted.push(...staged);
      staged = [];
      aborted = false;
      return { command, rows: [], rowCount: null };
    }
    if (aborted) {
      throw pgError("25P02", "current transaction is aborted, commands ignored until end of transaction block");
    }
    const insert = /^INSERT INTO "(tripReports|replications|substanceIndex)"/.exec(statement);
    if (insert) {
      inserts += 1;
      if (inserts === failInsertNumber) {
        aborted = true;
        throw pgError("23505", `duplicate key value violates unique constraint "${insert[1]}_slug_key"`);
      }
      staged.push(insert[1] as BulkTable);
    }
    return { rows: [], rowCount: 0 };
  });
  const pool = { on: vi.fn(), connect: vi.fn(async () => ({ query, release: vi.fn() })) };
  return { client: new PostgresClient(pool as never), persisted, statements };
}

const report = (slug: string) => ({
  slug,
  title: `Report ${slug}`,
  subject: { name: "Placeholder Author" },
  substances: [{ name: "LSD" }],
  onset: [],
  peak: [],
  offset: [],
  tags: [],
});

const replication = (slug: string) => ({
  slug,
  title: `Replication ${slug}`,
  artist: "Placeholder Artist",
  type: "image" as const,
  storage_id: `storage-${slug}`,
  effect_slug: "drifting",
  format: "png",
});

const substance = (id: number, slug: string) => {
  const { section_gaps: _sectionGaps, ...article } = structuredClone(minimalArticle) as typeof minimalArticle & { section_gaps?: unknown };
  return { ...article, id, title: `Substance ${slug}`, slug };
};

const saveSubstances = (client: PostgresClient, articles: unknown[]) =>
  client.mutation(api.substanceIndex.saveSubstances, {
    apiKey: "placeholder-token",
    actorEmail: "editor@example.com",
    articles,
  } as never);

const cases = [
  {
    name: "trip report bulk import",
    table: "tripReports" as const,
    run: (client: PostgresClient, slugs: string[]) =>
      client.mutation(tripReportsBulkImport, { reports: slugs.map(report) } as never),
    // A slug repeated within one batch is rejected before any SQL.
    runInvalid: (client: PostgresClient) =>
      client.mutation(tripReportsBulkImport, { reports: ["first", "second", "first"].map(report) } as never),
    invalidError: /Report first: slug appears more than once/,
  },
  {
    name: "replication bulk import",
    table: "replications" as const,
    run: (client: PostgresClient, slugs: string[]) =>
      client.mutation(replicationsBulkImport, { replications: slugs.map(replication) } as never),
    runInvalid: (client: PostgresClient) =>
      client.mutation(replicationsBulkImport, { replications: ["first", "second", "first"].map(replication) } as never),
    invalidError: /Failed to import first: slug appears more than once/,
  },
  {
    name: "substance ingestion",
    table: "substanceIndex" as const,
    run: (client: PostgresClient, slugs: string[]) =>
      saveSubstances(client, slugs.map((slug, index) => substance(index + 101, slug))),
    // The second article fails the structural contract.
    runInvalid: (client: PostgresClient) =>
      saveSubstances(client, [substance(101, "first"), { ...substance(102, "second"), dosage: "not a dosage object" }, substance(103, "third")]),
    invalidError: /Article Substance second: Invalid structure/,
  },
];

// Loading the function registry imports every server module; do it once,
// outside the per-test timeout.
beforeAll(async () => {
  await resolveFunction(tripReportsBulkImport);
}, 60_000);

describe.each(cases)("$name", ({ table, run, runInvalid, invalidError }) => {
  it("commits every row when no statement fails", async () => {
    const { client, persisted } = fakePostgres();
    await expect(run(client, ["first", "second", "third"])).resolves.toMatchObject({ created: 3, updated: 0, errors: [] });
    expect(persisted).toEqual([table, table, table]);
  });

  it("rejects the mutation, naming the failing row, when the second of three rows violates a unique index", async () => {
    const { client, persisted, statements } = fakePostgres({ failInsertNumber: 2 });
    await expect(run(client, ["first", "second", "third"])).rejects.toThrow(/second.*duplicate key value/);
    expect(persisted).toEqual([]);
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });

  it("returns pre-SQL validation errors and writes nothing", async () => {
    const { client, persisted, statements } = fakePostgres();
    const result = await runInvalid(client) as { created: number; updated: number; errors: string[] };
    expect(result).toMatchObject({ created: 0, updated: 0 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(invalidError);
    expect(statements.filter((statement) => /^(?:INSERT|UPDATE|DELETE)\b/.test(statement))).toEqual([]);
    expect(persisted).toEqual([]);
  });
});
