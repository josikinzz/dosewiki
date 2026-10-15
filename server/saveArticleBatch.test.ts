import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { PostgresClient } from "../lib/postgres/runtime/client";
import { PostgresDatabaseWriter, serialExecutor } from "../lib/postgres/runtime/db";
import { api } from "../lib/postgres/runtime/api";
import { admin, editor, SERVER_KEY, storedLsd } from "../lib/changeProposalReviewFixture";
import { articleDocument } from "./lib/articleLifecycleValidation";
import { sanitizeArticleForDataMutation } from "../src/app/api/save-article/saveArticleUtils";
import { contentHash } from "../lib/proposals/contentHash";
import type { FunctionArgs } from "../lib/postgres/runtime/api";

vi.mock("server-only", () => ({}));
vi.mock("../lib/postgres/runtime/functions.generated", async () => ({ functionModules: {
  saveArticleBatch: await import("./saveArticleBatch"), articleLifecycle: await import("./articleLifecycle"),
} }));

type Batch = FunctionArgs<typeof api.saveArticleBatch.save>;
const auth = { apiKey: SERVER_KEY, actorEmail: "admin@example.com" };
let database: PGlite;
let client: PostgresClient;
let failure: string | null = null;
let statements = 0;
let outboxInserts = 0;
const sql = async (statement: string, values?: unknown[]) => {
  statements += 1;
  if (statement.startsWith('INSERT INTO "publicCachePublications"')) outboxInserts += 1;
  if (failure && (statement.startsWith(`INSERT INTO "${failure}"`) || (failure === "second-outbox" && outboxInserts === 2 && statement.startsWith('INSERT INTO "publicCachePublications"')))) throw new Error("Injected atomic write failure");
  if (statement.includes(";") && !values?.length) {
    const results = await database.exec(statement);
    const result = results[results.length - 1];
    return { rows: result?.rows ?? [], rowCount: result?.affectedRows ?? 0 };
  }
  const result = await database.query(statement, values);
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
};

beforeAll(async () => {
  database = new PGlite();
  for (const name of (await readdir("lib/postgres/migrations")).filter(name => name.endsWith(".sql")).sort()) await database.exec(await readFile(`lib/postgres/migrations/${name}`, "utf8"));
  client = new PostgresClient({ on() {}, connect: async () => ({ query: sql, release() {} }), end: async () => {} } as never);
}, 30_000);
afterAll(async () => { await database.close(); });
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  vi.stubEnv("DATA_ADMIN_KEY", SERVER_KEY);
  const names = (await database.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows.map(row => `"${row.tablename}"`);
  await database.exec(`TRUNCATE ${names.join(", ")} CASCADE`);
  failure = null; outboxInserts = 0;
  const writer = new PostgresDatabaseWriter(serialExecutor({ query: sql } as never), new Map());
  for (const member of [admin, editor]) {
    const { _id: _id, ...document } = member;
    await writer.insert("memberships", document as never);
  }
  await writer.insert("substanceIndex", articleDocument(storedLsd as never));
});
afterEach(() => { vi.unstubAllEnvs(); });
async function input(operationId = "batch-test-operation"): Promise<Batch> {
  const loaded = await client.query(api.articleLifecycle.get, { ...auth, slug: "lsd" });
  return {
    ...auth, operationId,
    articles: [{ kind: "replace-existing", baseHash: loaded.baseHash, article: sanitizeArticleForDataMutation({ ...loaded.article, summary: "Synthetic revised summary" }) as never }],
    indexLayouts: [{ type: "chemical", version: 2, categories: [], expected: null, expectedRevision: 0 }],
    changelog: { markdown: "Synthetic summary edit", articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
  };
}
async function count(table: string) { return Number((await database.query<{ n: number }>(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n); }
async function snapshot() {
  const names = (await database.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows;
  const rows = [];
  for (const { tablename } of names) rows.push([tablename, (await database.query(`SELECT * FROM "${tablename}" ORDER BY 1`)).rows]);
  return contentHash(rows);
}

describe("article batch transaction", () => {
  it("journals once, owns one public history row, and exactly replays without further effects", async () => {
    const request = await input();
    const first = await client.mutation(api.saveArticleBatch.save, request);
    const committed = await snapshot();
    expect(first.articleResult).toMatchObject({ updated: 1, created: 0, errors: [] });
    expect(await count("articleRevisions")).toBe(1);
    expect(await count("changelog")).toBe(1);
    expect(await count("articleHistory")).toBe(1);
    expect(await count("articleBatchReceipts")).toBe(1);
    expect((await database.query<{ target: unknown }>(`SELECT target FROM "publicCachePublications" ORDER BY target->>'kind'`)).rows.map(row => row.target)).toEqual([
      { kind: "article", slug: "lsd", dependency: "content" },
      { kind: "changelog" },
      { kind: "chemical-lists" },
    ]);
    expect(await count("articleDraftReceipts")).toBe(1);
    expect(await count("contentRevisions")).toBe(1);
    expect(first.articleReceipts[0]).toMatchObject({ slug: "lsd", revisionId: expect.any(String), changeId: expect.any(String) });
    expect(first.layoutResults[0].operationId).toEqual(expect.any(String));
    expect(await client.mutation(api.saveArticleBatch.save, request)).toEqual(first);
    expect(await snapshot()).toBe(committed);
    await expect(client.mutation(api.saveArticleBatch.save, { ...request, changelog: { ...request.changelog!, markdown: "Different semantic input" } })).rejects.toMatchObject({ data: { code: "ARTICLE_BATCH_REUSED" } });
    expect(await snapshot()).toBe(committed);
  });
  it("refuses stale or missing baselines without changing any table", async () => {
    const stale = await input("stale-batch-operation");
    await client.mutation(api.saveArticleBatch.save, await input("winning-batch-operation"));
    const committed = await snapshot();
    await expect(client.mutation(api.saveArticleBatch.save, stale)).rejects.toMatchObject({ data: { code: "ARTICLE_CONFLICT" } });
    const missing = { ...stale, articles: stale.articles.map(command => ({ ...command, baseHash: "" })) };
    await expect(client.mutation(api.saveArticleBatch.save, missing)).rejects.toMatchObject({ data: { code: "ARTICLE_BASELINE_REQUIRED" } });
    expect(await snapshot()).toBe(committed);
  });
  it("checks freeze and current role before a known replay", async () => {
    const request = await input();
    await client.mutation(api.saveArticleBatch.save, request);
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    const before = statements;
    await expect(client.mutation(api.saveArticleBatch.save, request)).rejects.toMatchObject({ code: "DATA_WRITES_FROZEN" });
    expect(statements).toBe(before);
    vi.stubEnv("DATA_WRITES_FROZEN", "0");
    await database.exec(`UPDATE memberships SET role = 'editor' WHERE email = 'admin@example.com'`);
    await expect(client.mutation(api.saveArticleBatch.save, request)).rejects.toThrow("Admin access required");
  });
  it("permits a baseline-checked unchanged article with a changed layout", async () => {
    const request = await input();
    const loaded = await client.query(api.articleLifecycle.get, { ...auth, slug: "lsd" });
    request.articles = [{ kind: "replace-existing", baseHash: loaded.baseHash, article: sanitizeArticleForDataMutation(loaded.article) as never }];
    const first = await client.mutation(api.saveArticleBatch.save, request);
    expect(first.articleReceipts[0].unchanged).toBe(true);
    expect(first.layoutResults[0].receipt.unchanged).toBe(false);
    expect(await count("articleRevisions")).toBe(0);
    expect(await count("changelog")).toBe(0);
    const committed = await snapshot();
    expect(await client.mutation(api.saveArticleBatch.save, request)).toEqual(first);
    expect(await snapshot()).toBe(committed);
  });
  it.each(["articleRevisions", "contentRevisions", "articleBatchReceipts", "second-outbox"])("rolls every table back when %s fails", async table => {
    const request = await input();
    const before = await snapshot();
    failure = table; outboxInserts = 0;
    await expect(client.mutation(api.saveArticleBatch.save, request)).rejects.toThrow("Injected atomic write failure");
    failure = null;
    expect(await snapshot()).toBe(before);
  });
  it("creates only absent identities and refuses slug and ID collisions", async () => {
    const request = await input();
    const article = { ...request.articles[0].article, id: 2, slug: "synthetic-new", title: "Synthetic new article" };
    const created = { ...request, operationId: "create-batch-operation", articles: [{ kind: "create" as const, article }] };
    expect((await client.mutation(api.saveArticleBatch.save, created)).articleResult.created).toBe(1);
    const committed = await snapshot();
    for (const change of [{ ...article, id: 3 }, { ...article, slug: "another-synthetic" }]) await expect(client.mutation(api.saveArticleBatch.save, { ...created, operationId: `collision-${change.id}-${change.slug}`, articles: [{ kind: "create", article: change }] })).rejects.toMatchObject({ data: { code: "ARTICLE_CREATE_EXISTS" } });
    expect(await snapshot()).toBe(committed);
  });
});
