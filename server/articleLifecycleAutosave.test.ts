import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { migratedPGlite, pglitePool } from "../src/test/pglite";
import { PostgresClient } from "../lib/postgres/runtime/client";
import { PostgresDatabaseWriter, serialExecutor } from "../lib/postgres/runtime/db";
import { api } from "../lib/postgres/runtime/api";
import { admin, editor, SERVER_KEY, storedLsd } from "../lib/changeProposalReviewFixture";
import { articleDocument } from "./lib/articleLifecycleValidation";
import { sanitizeArticleForDataMutation } from "../src/app/api/save-article/saveArticleUtils";

vi.mock("server-only", () => ({}));
vi.mock("../lib/postgres/runtime/functions.generated", async () => ({ functionModules: {
  articleLifecycle: await import("./articleLifecycle"),
} }));

const ADMIN = "admin@example.com";
const OTHER_ADMIN = "second-admin@example.com";
const EDITOR = "editor@example.com";
let database: PGlite;
let client: PostgresClient;
let changeCounter = 0;

beforeAll(async () => {
  database = await migratedPGlite();
  client = new PostgresClient(pglitePool(database) as never);
}, 30_000);
afterAll(async () => { await database.close(); });
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  vi.stubEnv("DATA_ADMIN_KEY", SERVER_KEY);
  const names = (await database.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows.map((row) => `"${row.tablename}"`);
  await database.exec(`TRUNCATE ${names.join(", ")} CASCADE`);
  const pool = pglitePool(database);
  const writer = new PostgresDatabaseWriter(serialExecutor(await pool.connect() as never), new Map());
  for (const member of [admin, editor, { ...admin, _id: "m2", email: OTHER_ADMIN }]) {
    const { _id: _id, ...document } = member;
    await writer.insert("memberships", document as never);
  }
  await writer.insert("substanceIndex", articleDocument(storedLsd as never));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function write(actorEmail: string, action: "publish" | "saveDraft", change: Record<string, unknown>, autosave = false) {
  const auth = { apiKey: SERVER_KEY, actorEmail };
  const loaded = await client.query(api.articleLifecycle.get, { ...auth, slug: "lsd" });
  changeCounter += 1;
  return client.mutation(api.articleLifecycle.write, {
    ...auth, action, slug: "lsd", baseHash: loaded.baseHash, changeId: `autosave-test-${changeCounter}`,
    article: sanitizeArticleForDataMutation({ ...loaded.article, ...change }) as never, summary: "Synthetic edit",
    draftVersion: loaded.draftVersion ?? loaded.draft?.version ?? 0,
    ...(autosave ? { autosave: true } : {}),
  });
}
async function changelogRows() {
  return (await database.query<{ entryId: string; markdown: string }>('SELECT "entryId", "markdown" FROM "changelog" ORDER BY "_creationTime"')).rows;
}
async function count(table: string) { return Number((await database.query<{ n: number }>(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n); }

describe("autosaved article publishes", () => {
  it("refuses an editor's autosave", async () => {
    await expect(write(EDITOR, "publish", { summary: "Editor summary" }, true)).rejects.toThrow(/Admin access required/);
    expect(await count("articleRevisions")).toBe(0);
    expect(await count("changelog")).toBe(0);
  });

  it("refuses an autosave while the admin has a saved private draft and keeps that draft", async () => {
    await write(ADMIN, "saveDraft", { summary: "Draft summary" });
    await expect(write(ADMIN, "publish", { summary: "Autosaved summary" }, true)).rejects.toThrow(/saved private draft/);
    expect(await count("articleRevisions")).toBe(0);
    const loaded = await client.query(api.articleLifecycle.get, { apiKey: SERVER_KEY, actorEmail: ADMIN, slug: "lsd" });
    expect(loaded.draft?.article.summary).toBe("Draft summary");
    expect(loaded.article.summary).toBe("Stored summary");
  });

  it("shares one changelog entry across an admin's run and never folds in another writer's change", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T10:00:00.000Z"));
    await write(ADMIN, "publish", { summary: "First autosaved summary" }, true);
    vi.setSystemTime(new Date("2026-03-01T10:03:00.000Z"));
    await write(ADMIN, "publish", { title: "LSD-25" }, true);
    let rows = await changelogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].entryId).toMatch(/^article-session-/);
    expect(rows[0].markdown).toContain("summary");
    expect(rows[0].markdown).toContain("title");
    expect(await count("articleRevisions")).toBe(2);

    vi.setSystemTime(new Date("2026-03-01T10:04:00.000Z"));
    await write(OTHER_ADMIN, "publish", { summary: "Second admin summary" });
    vi.setSystemTime(new Date("2026-03-01T10:05:00.000Z"));
    await write(ADMIN, "publish", { title: "LSD" }, true);
    rows = await changelogRows();
    expect(rows).toHaveLength(3);
    expect(rows[2].entryId).toMatch(/^article-session-/);
    expect(rows[2].markdown).toContain("title");
    expect(rows[2].markdown).not.toContain("summary");

    vi.setSystemTime(new Date("2026-03-01T10:16:00.000Z"));
    await write(ADMIN, "publish", { summary: "Summary after the window" }, true);
    expect(await changelogRows()).toHaveLength(4);
  });
});
