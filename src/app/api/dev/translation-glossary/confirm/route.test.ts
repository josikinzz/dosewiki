// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { PostgresClient } from "@server/postgres/runtime/client";
import { roleSessionFor } from "@/test/routeSession";
import { POST } from "./route";

vi.setConfig({ testTimeout: 30000 });
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
const seam = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@server/postgres/runtime/backend", () => ({
  getDataBackend: () => "postgres",
  getPostgresClient: () => seam.client,
}));

const LOCALE = "zh-Hans";
const actor = { email: "sin@example.test", glossaryLocales: [LOCALE] };
let database: PGlite;

const post = (path: string, body: unknown) =>
  new Request(`https://dev.dose.wiki/api/dev/translation-glossary/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://dev.dose.wiki" },
    body: JSON.stringify(body),
  });
const confirm = (terms: Record<string, string>, extra: Record<string, unknown> = {}) =>
  POST(post("confirm", { locale: LOCALE, terms: Object.keys(terms), expectedRevisions: terms, ...extra }));

async function seedGlossary(term: string, target: string, status: "approved" | "draft", reviewedBy: string | null = "legacy-import") {
  await database.query(
    `INSERT INTO "translationGlossary" (locale, term, target, kind, status, source, reviewed_at, reviewed_by, retranslation_requested_at, updated_at)
     VALUES ($1,$2,$3,'effect-name',$4,'model',5,$5,5,10)`,
    [LOCALE, term, target, status, reviewedBy],
  );
}
const history = async (term: string) =>
  (await database.query<{ action: string; actor: string; reason: string; revision: number }>(
    `SELECT action, actor, reason, revision FROM "translationReviewHistory" WHERE locale = $1 AND source_id = $2 ORDER BY revision`,
    [LOCALE, term],
  )).rows;
const glossaryRow = async (term: string) =>
  (await database.query(`SELECT * FROM "translationGlossary" WHERE locale = $1 AND term = $2`, [LOCALE, term])).rows[0];

beforeAll(async () => {
  database = new PGlite();
  for (const filename of readdirSync("lib/postgres/migrations").filter((file) => file.endsWith(".sql")).sort())
    await database.exec(readFileSync(`lib/postgres/migrations/${filename}`, "utf8"));
  // Adapt the pg transport only; the route, review store, and SQL are production code.
  const connection = {
    query: async (sql: string, params?: unknown[]) => {
      if (!params?.length && sql.includes(";")) {
        const results = await database.exec(sql);
        const result = results[results.length - 1];
        return { rows: result?.rows ?? [], rowCount: result?.affectedRows ?? 0 };
      }
      const result = await database.query(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
    },
    release() {},
  };
  seam.client = new PostgresClient({ on() {}, connect: async () => connection } as unknown as Pool);
}, 30000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  auth.requireRoleSession.mockImplementation(roleSessionFor("translator", actor));
  await database.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory";');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => database?.close());

describe("confirming live wording nobody has checked, over isolated Postgres", () => {
  it("refuses a stale revision and writes nothing", async () => {
    await seedGlossary("Euphoria", "欣快", "approved");
    const before = await glossaryRow("Euphoria");
    const response = await confirm({ Euphoria: "9:0" });
    expect(response.status).toBe(409);
    expect(await history("Euphoria")).toEqual([]);
    expect(await glossaryRow("Euphoria")).toEqual(before);
    expect((await database.query(`SELECT 1 FROM "translationReviewEntries"`)).rows).toEqual([]);
  });

  it("fails closed under DATA_WRITES_FROZEN=1", async () => {
    await seedGlossary("Euphoria", "欣快", "approved");
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    const response = await confirm({ Euphoria: "10:0" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "DATA_WRITES_FROZEN" });
    expect(await history("Euphoria")).toEqual([]);
    expect(await glossaryRow("Euphoria")).toMatchObject({ reviewed_by: "legacy-import", source: "model" });
  });

  it("requires the translator role, the assigned language, and expected revisions", async () => {
    await seedGlossary("Euphoria", "欣快", "approved");
    auth.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    expect((await confirm({ Euphoria: "10:0" })).status).toBe(403);
    auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { ...actor, glossaryLocales: ["nl"] }));
    expect((await confirm({ Euphoria: "10:0" })).status).toBe(403);
    auth.requireRoleSession.mockImplementation(roleSessionFor("translator", actor));
    expect((await POST(post("confirm", { locale: LOCALE, terms: ["Euphoria"] }))).status).toBe(400);
    expect(await history("Euphoria")).toEqual([]);
  });
});
