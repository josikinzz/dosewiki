// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { POST as approveGlossaryPost } from "../translation-glossary/approve/route";
import { GET as glossaryHistoryGet } from "../translation-glossary/history/route";
import { POST as editGlossaryPost } from "../translation-glossary/edit/route";
import { GET as workbenchHistoryGet } from "../translation-workbench/history/route";
import { POST as workbenchPost } from "../translation-workbench/route";
import { GET, POST } from "./route";

vi.setConfig({ testTimeout: 30_000 });
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
const source = vi.hoisted(() => ({ record: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: () => transport }));
vi.mock("@server/next/publishPublicCache", () => ({ publishPublicCache: vi.fn(async () => []) }));
vi.mock("@server/data/publicData.reads", () => ({
  getPublicDataReadAdapter: () => ({
    getPublicSubstanceBySlug: async (slug: string) => (source.record?.slug === slug ? source.record : null),
    getPublicSubstanceSlugs: async () => (source.record ? [source.record.slug] : []),
    getPublicEffects: async () => [],
    getPublicTripReportRecords: async () => [],
    getPublishedEffectIndexArticles: async () => [],
    getPublicReplications: async () => [],
    getPublicContributorProfiles: async () => [],
  }),
}));

const LOCALE = "zh-Hans";
const origin = "https://dev.dose.wiki";
const ENGLISH = "Replications of visual effects help readers understand what a dose can feel like.";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync("lib/postgres/migrations").filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(`lib/postgres/migrations/${file}`, "utf8"));
  // Adapt the transport only. The routes, access checks, stores, and SQL are production code.
  transport.sql.mockImplementation(async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows);
  transport.sqlTransaction.mockImplementation((operation: (tx: { query: typeof db.query }) => Promise<unknown>) => db.transaction((tx) => operation({ query: tx.query.bind(tx) as typeof db.query })));
}, 300_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "sin@example.test", glossaryLocales: [LOCALE] }));
  source.record = { slug: "sample", summary: ENGLISH };
  await db.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory", "translationSegments"');
  await db.query(
    `INSERT INTO "translationGlossary" (locale, term, target, kind, status, source, reviewed_at, reviewed_by, retranslation_requested_at, updated_at) VALUES ($1,'Replication','体验再现','concept','approved','human',5,'sin@example.test',5,10), ($1,'Dose','剂量','concept','draft','model',NULL,NULL,NULL,10)`,
    [LOCALE],
  );
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db?.close(); });

const post = (path: string, body: unknown) => new Request(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
async function packet() {
  const response = await GET(new Request(`${origin}/api/dev/translation-narrative?locale=${LOCALE}&kind=article&slug=sample`));
  expect(response.status).toBe(200);
  return response.json();
}
async function history(id: string) {
  return (await (await GET(new Request(`${origin}/api/dev/translation-narrative?locale=${LOCALE}&kind=article&slug=sample&history=${id}`))).json()).history;
}
const DROPPED = "视觉效果的再现作品帮助读者理解一次剂量的感受。";

describe("correction reasons and the glossary check on the narrative route", () => {
  it("lists the glossary rows each paragraph mentions", async () => {
    const { rows } = await packet();
    expect(rows[0].glossary).toEqual([
      expect.objectContaining({ term: "Dose", target: "剂量", approved: false }),
      expect.objectContaining({ term: "Replication", target: "体验再现", approved: true }),
    ]);
  });

  it("refuses a correction that drops an approved term, naming it, and writes nothing", async () => {
    const { rows, sourceVersion } = await packet();
    const response = await POST(post("/api/dev/translation-narrative", { locale: LOCALE, kind: "article", slug: "sample", id: rows[0].id, sourceVersion, expectedRevision: 0, action: "save", target: DROPPED, reason: { kind: "fluency", note: "Smoother" } }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ code: "GLOSSARY_CONFLICT", conflicts: [{ term: "Replication", target: "体验再现" }] });
    expect(body.error).toBe("This sentence mentions Replication (体验再现). Your wording does not use it.");
    expect((await db.query('SELECT 1 FROM "translationReviewHistory"')).rows).toHaveLength(0);
  });

  it("saves with a Fine here exception and records the reason and the exception", async () => {
    const { rows, sourceVersion } = await packet();
    const response = await POST(post("/api/dev/translation-narrative", { locale: LOCALE, kind: "article", slug: "sample", id: rows[0].id, sourceVersion, expectedRevision: 0, action: "save", target: DROPPED, reason: { kind: "fluency", note: "Smoother" }, glossaryExceptions: ["Replication"] }));
    expect(response.status).toBe(200);
    expect(await history(rows[0].id)).toEqual([expect.objectContaining({ action: "save", actor: "sin@example.test", reason: { kind: "fluency", note: "Smoother" }, glossaryExceptions: ["Replication"] })]);
  });

  it("saves wording that keeps the term with no exception to record", async () => {
    const { rows, sourceVersion } = await packet();
    const response = await POST(post("/api/dev/translation-narrative", { locale: LOCALE, kind: "article", slug: "sample", id: rows[0].id, sourceVersion, expectedRevision: 0, action: "save", target: "视觉效果的体验再现帮助读者理解一次剂量的感受。", reason: { kind: "accuracy" } }));
    expect(response.status).toBe(200);
    expect(await history(rows[0].id)).toEqual([expect.objectContaining({ reason: { kind: "accuracy", note: "" }, glossaryExceptions: [] })]);
  });

  it("refuses an unknown reason kind", async () => {
    const { rows, sourceVersion } = await packet();
    const response = await POST(post("/api/dev/translation-narrative", { locale: LOCALE, kind: "article", slug: "sample", id: rows[0].id, sourceVersion, expectedRevision: 0, action: "save", target: "体验再现", reason: { kind: "style" } }));
    expect(response.status).toBe(400);
  });

  it("still reads history rows written before reasons were structured", async () => {
    const { rows } = await packet();
    const state = JSON.stringify({ revision: 0, draft: null, approved: null });
    await db.query(
      `INSERT INTO "translationReviewHistory" (locale, scope, source_id, revision, action, before_state, after_state, actor, reason, created_at) VALUES ($1,'narrative',$2,1,'save',$3::jsonb,$3::jsonb,'old@example.test','Preserve meaning',1), ($1,'narrative',$2,2,'save',$3::jsonb,$3::jsonb,'old@example.test','{not json',2)`,
      [LOCALE, rows[0].id, state],
    );
    expect(await history(rows[0].id)).toEqual([
      expect.objectContaining({ revision: 2, reason: { kind: "unspecified", note: "{not json" }, glossaryExceptions: [] }),
      expect.objectContaining({ revision: 1, reason: { kind: "unspecified", note: "Preserve meaning" }, glossaryExceptions: [] }),
    ]);
    // A plain-text reason from an older caller is still accepted and stored as before.
    const { sourceVersion } = await packet();
    await db.exec('TRUNCATE "translationReviewHistory", "translationReviewEntries"');
    const legacy = await POST(post("/api/dev/translation-narrative", { locale: LOCALE, kind: "article", slug: "sample", id: rows[0].id, sourceVersion, expectedRevision: 0, action: "save", target: "视觉效果的体验再现帮助读者理解一次剂量的感受。", reason: "Accepted from the Inbox" }));
    expect([legacy.status, await legacy.json()]).toEqual([200, expect.anything()]);
    expect((await db.query<{ reason: string }>('SELECT reason FROM "translationReviewHistory"')).rows[0].reason).toBe("Accepted from the Inbox");
  });
});

describe("the same check on UI label saves", () => {
  const save = (extra: Record<string, unknown>) => workbenchPost(post("/api/dev/translation-workbench", { locale: LOCALE, id: "gallery.replications", action: "save", expectedRevision: 0, target: "再现作品", reason: { kind: "terminology" }, ...extra }));

  it("returns a conflict naming the term, then saves and records the exception", async () => {
    const refused = await save({});
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "GLOSSARY_CONFLICT", conflicts: [{ term: "Replication", target: "体验再现" }] });
    const saved = await save({ glossaryExceptions: ["Replication"] });
    expect(saved.status).toBe(200);
    expect((await saved.json()).row.glossary).toEqual([expect.objectContaining({ term: "Replication", approved: true })]);
    const response = await workbenchHistoryGet(new Request(`${origin}/api/dev/translation-workbench/history?locale=${LOCALE}&id=gallery.replications`));
    expect((await response.json()).history).toEqual([expect.objectContaining({ reason: { kind: "terminology", note: "" }, glossaryExceptions: ["Replication"] })]);
  });
});

describe("glossary approvals record the chosen reason", () => {
  it("records the reason the reviewer chose instead of the fixed wording", async () => {
    const edited = await editGlossaryPost(post("/api/dev/translation-glossary/edit", { locale: LOCALE, term: "Dose", target: "剂量", expectedRevision: "10:0", reason: { kind: "terminology", note: "Proposed from a correction" } }));
    expect(edited.status).toBe(200);
    const { row } = await edited.json();
    const approved = await approveGlossaryPost(post("/api/dev/translation-glossary/approve", { locale: LOCALE, terms: ["Dose"], expectedRevisions: { Dose: row.revision }, reason: { kind: "accuracy", note: "Matches the pharmacology" } }));
    expect(approved.status).toBe(200);
    const response = await glossaryHistoryGet(new Request(`${origin}/api/dev/translation-glossary/history?locale=${LOCALE}&term=Dose`));
    const entries = (await response.json()).history;
    expect(entries.map((entry: { action: string; reason: unknown }) => [entry.action, entry.reason])).toEqual([
      ["approve", { kind: "accuracy", note: "Matches the pharmacology" }],
      ["save", { kind: "terminology", note: "Proposed from a correction" }],
    ]);
  });
});
