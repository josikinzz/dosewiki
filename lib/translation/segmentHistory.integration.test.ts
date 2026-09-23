// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { writeTranslations, type TranslationSegmentRow } from "./segmentStore";
import { parseSegmentHistoryOptions, readTranslationSegmentHistory } from "./segmentHistoryStore";
vi.mock("server-only", () => ({}));
const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("@server/postgres/runtime/backend", () => ({ getPostgresClient: () => transport }));
vi.mock("./publicationIndexStore", () => ({ refreshLocalizedPublicationIndexes: refresh }));
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE TABLE "translationSegments" (locale text NOT NULL, hash text NOT NULL, source text NOT NULL, target text NOT NULL, model text NOT NULL, prompt_version text NOT NULL, created_at bigint NOT NULL, PRIMARY KEY(locale,hash))');
  await db.exec('CREATE TABLE "translationGlossary" (locale text)');
  await db.exec(await readFile(new URL("../postgres/migrations/0020_translation_review_workspace.sql", import.meta.url), "utf8"));
  transport.sql.mockImplementation(async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows);
  transport.sqlTransaction.mockImplementation((operation: (tx: { query: typeof db.query }) => Promise<unknown>) => db.transaction((tx) => operation({ query: tx.query.bind(tx) as typeof db.query })));
}, 30_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  refresh.mockReset().mockResolvedValue(0);
  await db.exec('TRUNCATE "translationSegments", "translationSegmentHistory"');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db?.close(); });
const row: TranslationSegmentRow = { locale: "zh-Hans", hash: "a".repeat(16), source: "Replication", target: "复现", model: "model-v1", prompt_version: "prompt-v1" };
describe("automatic segment history through real Postgres statements", () => {
  it("retains initial and replacement snapshots, excluding metadata-only refreshes", async () => {
    await writeTranslations([row]);
    await writeTranslations([{ ...row, model: "model-v2", prompt_version: "prompt-v2" }]);
    await writeTranslations([{ ...row, target: "体验再现", model: "model-v3", prompt_version: "prompt-v3" }]);
    const history = await readTranslationSegmentHistory(row.locale);
    expect(history.changes).toHaveLength(2);
    expect(history.changes[0]).toMatchObject({ before: { target: "复现", model: "model-v2", promptVersion: "prompt-v2" }, after: { target: "体验再现", model: "model-v3", promptVersion: "prompt-v3" } });
    expect(history.changes[1].before).toBeNull();
  });
  it("paginates deterministically without duplicate rows and scopes history to locale/hash", async () => {
    await writeTranslations([row, { ...row, hash: "b".repeat(16) }, { ...row, locale: "nl" }]);
    const first = await readTranslationSegmentHistory(row.locale, { limit: 1 });
    expect(first.changes).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await readTranslationSegmentHistory(row.locale, { limit: 1, cursor: first.nextCursor });
    expect(second.changes).toHaveLength(1);
    expect(second.changes[0].id).not.toBe(first.changes[0].id);
    expect(second.nextCursor).toBeNull();
    expect((await readTranslationSegmentHistory(row.locale, { hash: row.hash })).changes).toHaveLength(1);
  });
  it("rolls history and target back together when index refresh fails, and honors freeze", async () => {
    await writeTranslations([row]);
    refresh.mockRejectedValueOnce(new Error("projection failure"));
    await expect(writeTranslations([{ ...row, target: "体验再现" }])).rejects.toThrow("projection failure");
    expect((await readTranslationSegmentHistory(row.locale)).changes).toHaveLength(1);
    expect((await db.query('SELECT target FROM "translationSegments"')).rows[0]).toEqual({ target: "复现" });
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    await expect(writeTranslations([{ ...row, target: "体验再现" }])).rejects.toThrow();
    expect((await readTranslationSegmentHistory(row.locale)).changes).toHaveLength(1);
  });
  it("rejects oversized/invalid pagination and hash inputs", () => {
    for (const options of [{ limit: 101 }, { limit: -1 }, { cursor: "9223372036854775808" }, { cursor: "1 OR true" }, { hash: "invalid" }]) expect(() => parseSegmentHistoryOptions(options)).toThrow();
  });
});
