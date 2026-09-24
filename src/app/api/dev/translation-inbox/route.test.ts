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
import { GET as narrativeGet, POST as narrativePost } from "../translation-narrative/route";
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
  // Adapt the transport only. The routes, access checks, stores, and SQL are production code.
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
/** A human approval recorded against English the label no longer has. */
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

  it("pages at 50 and states the total", async () => {
    for (let i = 0; i < 60; i += 1) await seedLegacy(`Term ${String(i).padStart(2, "0")}`, `词${i}`);
    const first = await read();
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(60);
    const second = await read(50);
    expect(second.items).toHaveLength(10);
    expect(second.items[0].id).toBe("Term 50");
    expect((await inbox(LOCALE, 7)).status).toBe(400);
  });

  it("refuses Accept at a stale revision and writes nothing", async () => {
    await seedLegacy("Euphoria", "欣快");
    await seedStaleUiApproval("appearance.light", "Light mode", "浅色模式");
    const [ui, glossary] = (await read()).items;

    // Another reviewer changes both after this inbox page was read.
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

  it("drops an item from the inbox once Accept confirms it at the revision shown", async () => {
    await seedLegacy("Euphoria", "欣快");
    const [item] = (await read()).items;
    const response = await confirmPost(post("/api/dev/translation-glossary/confirm", { locale: LOCALE, terms: [item.id], expectedRevisions: { [item.id]: item.revision } }));
    expect(response.status).toBe(200);
    expect(await read()).toMatchObject({ total: 0, items: [] });
  });

  it("lists article approvals whose own English changed and those whose neighbour changed", async () => {
    const approvedSource = "2-Benzylpiperidine is a stimulant of the piperidine class.";
    const neighbour = "It is structurally related to methylphenidate.";
    source.record = { slug: "sample", toxicity: [approvedSource, neighbour], summary: "This is a long source sentence about visual perception." };
    const packet = await (await narrativeGet(new Request(`${origin}/api/dev/translation-narrative?locale=${LOCALE}&kind=article&slug=sample`))).json();
    const approve = async (english: string, target: string) => {
      const row = packet.rows.find((r: { source: string }) => r.source === english);
      const base = { locale: LOCALE, kind: "article", slug: "sample", id: row.id, sourceVersion: packet.sourceVersion, reason: "Terminology" };
      const saved = await (await narrativePost(post("/api/dev/translation-narrative", { ...base, action: "save", expectedRevision: 0, target }))).json();
      expect((await narrativePost(post("/api/dev/translation-narrative", { ...base, action: "approve", expectedRevision: saved.entry.revision }))).status).toBe(200);
      return row;
    };
    const toxicity = await approve(approvedSource, "2-苄基哌啶是一种哌啶类兴奋剂。");
    const summary = await approve("This is a long source sentence about visual perception.", "这是一段有关视觉感知的较长说明。");
    expect((await read()).total).toBe(0);

    // The toxicity neighbour and the summary's own English change.
    source.record = { ...source.record, toxicity: [approvedSource, "It is structurally related to methylphenidate and other phenidates."], summary: "This source sentence about perception changed." };
    const body = await read();
    expect(body.items.map((item) => [item.id, item.reason])).toEqual([
      [summary.id, "narrative-source-changed"],
      [toxicity.id, "narrative-recheck"],
    ]);
    expect(body.items[0]).toMatchObject({ english: "This source sentence about perception changed.", live: null, accept: null, previous: { target: "这是一段有关视觉感知的较长说明。" } });
    expect(body.items[1]).toMatchObject({ english: approvedSource, live: "2-苄基哌啶是一种哌啶类兴奋剂。", accept: { kind: "narrative-approve", slug: "sample", id: toxicity.id } });
    expect(body.items[1].href).toContain(`translationSegment=${toxicity.id}`);

    // Accepting the re-check through the narrative route, at the revision shown, clears it.
    const accept = body.items[1].accept!;
    if (accept.kind !== "narrative-approve") throw new Error("expected a narrative accept");
    const base = { locale: LOCALE, kind: "article", slug: accept.slug, id: accept.id, sourceVersion: accept.sourceVersion, reason: "Accepted from the Inbox" };
    const saved = await (await narrativePost(post("/api/dev/translation-narrative", { ...base, action: "save", expectedRevision: accept.expectedRevision, target: accept.target }))).json();
    expect((await narrativePost(post("/api/dev/translation-narrative", { ...base, action: "approve", expectedRevision: saved.entry.revision }))).status).toBe(200);
    expect((await read()).items.map((item) => item.id)).toEqual([summary.id]);
  });
});
