// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import type { InboxResponse } from "@server/translation/reviewInboxTypes";
import { UI_MESSAGE_INVENTORY } from "@server/translation/uiWorkbenchDefinitions";
import { writeUiTranslation } from "@server/translation/uiTranslationStore";
import { POST as confirmPost } from "../translation-glossary/confirm/route";
import { POST as editPost } from "../translation-glossary/edit/route";
import { POST as workbenchPost } from "../translation-workbench/route";
import { GET } from "./route";

vi.setConfig({ testTimeout: 30_000 });
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
const reviewer = { email: "sin@example.test", glossaryLocales: [LOCALE] };
const origin = "https://dev.dose.wiki";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync("lib/postgres/migrations").filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(`lib/postgres/migrations/${file}`, "utf8"));
  transport.sql.mockImplementation(async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows);
  transport.sqlTransaction.mockImplementation((operation: (tx: { query: typeof db.query }) => Promise<unknown>) => db.transaction((tx) => operation({ query: tx.query.bind(tx) as typeof db.query })));
}, 60_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  auth.requireRoleSession.mockImplementation(roleSessionFor("translator", reviewer));
  source.record = null;
  await db.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory", "translationSegments"');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db?.close(); });

const inbox = async (locale = LOCALE, offset?: number) => GET(new Request(`${origin}/api/dev/translation-inbox?locale=${locale}${offset === undefined ? "" : `&offset=${offset}`}`));
const read = async (offset?: number) => {
  const response = await inbox(LOCALE, offset);
  expect(response.status).toBe(200);
  return (await response.json()) as InboxResponse;
};
const post = (path: string, body: unknown) => new Request(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
const historyCount = async () => Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM "translationReviewHistory"')).rows[0].n);
async function seedLegacy(term: string, target: string) {
  await db.query(
    `INSERT INTO "translationGlossary" (locale, term, target, kind, status, source, reviewed_at, reviewed_by, retranslation_requested_at, updated_at) VALUES ($1,$2,$3,'effect-name','approved','model',5,'legacy-import',5,10)`,
    [LOCALE, term, target],
  );
}
async function seedStaleUiApproval(id: string, oldSource: string, target: string) {
  const { context } = UI_MESSAGE_INVENTORY[id];
  await db.query(
    `INSERT INTO "translationReviewEntries" (locale, scope, source_id, revision, draft, approved, updated_at) VALUES ($1,'ui',$2,2,NULL,$3::jsonb,1)`,
    [LOCALE, id, JSON.stringify({ source: oldSource, context, target })],
  );
}

describe("the review inbox read route over isolated Postgres", () => {
  it("lists legacy glossary rows and a stale UI approval for an assigned locale, and refuses an unassigned one", async () => {
    await seedLegacy("Euphoria", "欣快");
    await seedLegacy("Anxiety", "焦虑");
    await db.query(`INSERT INTO "translationGlossary" (locale, term, target, kind, status, source, updated_at) VALUES ($1,'Drifting','漂移','effect-name','draft','model',10)`, [LOCALE]);
    await seedStaleUiApproval("appearance.light", "Light mode", "浅色模式");

    const body = await read();
    expect(body.total).toBe(3);
    expect(body.pageSize).toBe(50);
    expect(body.items.map((item) => [item.scope, item.id, item.reason])).toEqual([
      ["ui", "appearance.light", "ui-source-changed"],
      ["glossary", "Anxiety", "glossary-never-checked"],
      ["glossary", "Euphoria", "glossary-never-checked"],
    ]);
    expect(body.items[1]).toMatchObject({ english: "Anxiety", live: "焦虑", revision: "10:0", accept: { kind: "glossary-confirm", term: "Anxiety", expectedRevision: "10:0" } });
    expect(body.items[1].href).toContain("translationTerm=Anxiety");
    expect(body.items[0]).toMatchObject({ english: "Light", revision: "2", previous: { english: "Light mode", target: "浅色模式" } });
    expect(body.checked).toEqual(expect.arrayContaining(["glossary-never-checked", "ui-source-changed", "narrative-source-changed", "narrative-recheck"]));

    const denied = await inbox("nl");
    expect(denied.status).toBe(403);
    auth.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    expect((await inbox()).status).toBe(403);
  });

  it("refuses Accept at a stale revision and writes nothing", async () => {
    await seedLegacy("Euphoria", "欣快");
    await seedStaleUiApproval("appearance.light", "Light mode", "浅色模式");
    const [ui, glossary] = (await read()).items;

    expect((await editPost(post("/api/dev/translation-glossary/edit", { locale: LOCALE, term: "Euphoria", target: "愉悦", expectedRevision: glossary.revision }))).status).toBe(200);
    await writeUiTranslation({ locale: LOCALE, id: "appearance.light", action: "save", target: "亮色", expectedRevision: 2, actor: "other@example.test", reason: "Other draft" });
    const before = await historyCount();
    const beforeGlossary = (await db.query(`SELECT * FROM "translationGlossary"`)).rows;

    const confirmed = await confirmPost(post("/api/dev/translation-glossary/confirm", { locale: LOCALE, terms: ["Euphoria"], expectedRevisions: { Euphoria: glossary.accept?.kind === "glossary-confirm" ? glossary.accept.expectedRevision : "" } }));
    expect(confirmed.status).toBe(409);
    const saved = await workbenchPost(post("/api/dev/translation-workbench", { locale: LOCALE, id: ui.id, action: "save", expectedRevision: Number(ui.revision), target: "浅色", reason: "Accepted from the Inbox" }));
    expect(saved.status).toBe(409);

    expect(await historyCount()).toBe(before);
    expect((await db.query(`SELECT * FROM "translationGlossary"`)).rows).toEqual(beforeGlossary);
  });
});
