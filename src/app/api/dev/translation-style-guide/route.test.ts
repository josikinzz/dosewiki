// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import type { StyleGuidePacket } from "@server/translation/styleGuideTypes";
import { GET, POST } from "./route";

vi.setConfig({ testTimeout: 60_000 });
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
const cache = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: () => transport }));
vi.mock("@server/next/publishPublicCache", () => cache);

const SUMMARY = "2-Benzylpiperidine is a stimulant of the phenidate family.";
const article = { slug: "2-benzylpiperidine", summary: SUMMARY };
vi.mock("@server/data/publicData.reads", () => ({
  getPublicDataReadAdapter: () => ({
    getPublicSubstanceBySlug: async (slug: string) => (slug === article.slug ? article : null),
    getPublicSubstanceSlugs: async () => [article.slug],
    getPublicEffects: async () => [],
    getPublicTripReportRecords: async () => [],
    getPublishedEffectIndexArticles: async () => [],
    getPublicReplications: async () => [],
    getPublicContributorProfiles: async () => [],
  }),
}));

const LOCALE = "zh-Hans";
const origin = "https://dev.dose.wiki";
const url = `${origin}/api/dev/translation-style-guide`;
const RULE = "用“服用”描述剂量，不用“摄入”。";
const GUIDE = {
  rules: [RULE],
  examples: [{ source: "Replications recreate the visual effects.", before: "返回复现", after: "复现作品", why: "The gallery label reads as a noun." }],
};
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync("lib/postgres/migrations").filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(`lib/postgres/migrations/${file}`, "utf8"));
  // Adapt the transport only. The routes, access checks, stores, and SQL are production code.
  transport.sql.mockImplementation(async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows);
  transport.sqlTransaction.mockImplementation((operation: (tx: { query: typeof db.query }) => Promise<unknown>) => db.transaction((tx) => operation({ query: tx.query.bind(tx) as typeof db.query })));
}, 180_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "sin@example.test", glossaryLocales: [LOCALE] }));
  await db.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory", "translationSegments", "translationJobs"');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db?.close(); });

const read = async (locale = LOCALE, history = false) => GET(new Request(`${url}?${new URLSearchParams({ locale, ...(history ? { history: "1" } : {}) })}`));
const packet = async () => (await (await read()).json()) as StyleGuidePacket;
const post = (body: Record<string, unknown>) => POST(new Request(url, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ locale: LOCALE, reason: "House style", ...body }),
}));
const stored = async () => (await db.query('SELECT count(*)::int AS n FROM "translationReviewEntries" WHERE "scope" = \'style-guide\'')).rows[0] as { n: number };

describe("style guide route", () => {
  it("approval requires Translator access to that locale", async () => {
    expect((await post({ action: "save", expectedRevision: 0, guide: GUIDE })).status).toBe(200);
    auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "ru@example.test", glossaryLocales: ["ru"] }));
    expect((await post({ action: "approve", expectedRevision: 1 })).status).toBe(403);
    expect((await read()).status).toBe(403);
    expect((await post({ action: "save", expectedRevision: 1, guide: GUIDE })).status).toBe(403);
    auth.requireRoleSession.mockImplementation(roleSessionFor(null));
    expect((await post({ action: "approve", expectedRevision: 1 })).status).toBe(401);
    auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "sin@example.test", glossaryLocales: [LOCALE] }));
    expect(await packet()).toMatchObject({ revision: 1, approved: null });
  });

  it("fails closed while writes are frozen", async () => {
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    expect((await post({ action: "save", expectedRevision: 0, guide: GUIDE })).status).toBe(503);
    expect((await stored()).n).toBe(0);
  });
});
