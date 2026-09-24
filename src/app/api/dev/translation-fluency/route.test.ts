// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { PostgresClient } from "@server/postgres/runtime/client";
import { segmentsOf } from "@server/translation/liveTranslation";
import { narrativeIdentity } from "@server/translation/narrativeIdentity";
import type { InboxResponse } from "@server/translation/reviewInboxTypes";
import { decodeReviewReason } from "@server/translation/reviewReason";
import { GET as inboxGet } from "../translation-inbox/route";
import { POST as acceptPost } from "../translation-inbox/suggestion/route";
import { POST } from "./route";

vi.setConfig({ testTimeout: 90_000 });
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const seam = vi.hoisted(() => ({ client: null as unknown, record: null as null | Record<string, unknown> }));
// The provider is stubbed at the pipeline's client; the engine's transport, the route, checks, and stores are production code.
const provider = vi.hoisted(() => ({ callOpenRouterChat: vi.fn() }));
vi.mock("../../../../../scripts/lib/openrouter-sdk.mjs", () => provider);
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null), getClientIp: () => "127.0.0.1" }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: () => seam.client }));
vi.mock("@server/data/serverWriteCapability", () => ({ getServerDataWriteCapability: () => ({ ok: false }) }));
vi.mock("@server/data/publicData.reads", () => ({
  getPublicDataReadAdapter: () => ({
    getPublicSubstanceBySlug: async (slug: string) => (seam.record?.slug === slug ? seam.record : null),
    getPublicSubstanceSlugs: async () => (seam.record ? [seam.record.slug] : []),
    getPublicEffects: async () => [],
    getPublicTripReportRecords: async () => [],
    getPublishedEffectIndexArticles: async () => [],
    getPublicReplications: async () => [],
    getPublicContributorProfiles: async () => [],
  }),
}));

const LOCALE = "zh-Hans";
const admin = { email: "josie@example.test", glossaryLocales: [LOCALE] };
const translator = { email: "sin@example.test", glossaryLocales: [LOCALE] };
const origin = "https://dev.dose.wiki";
const SLUG = "2-benzylpiperidine";
const PHENIDATE_SOURCE = "2-Benzylpiperidine is a stimulant that is structurally related to other phenidates.";
const PHENIDATE_TARGET = "2-苄基哌啶是一种兴奋剂，在结构上与其他哌甲酯类相关。";
const DOSE_SOURCE = "A common oral dose is 50 mg.";
const DOSE_TARGET = "常见的口服剂量是 50 mg。";
/** One fluent edit, one that changes a number, and one that drops the approved rendering. */
const REPLY = {
  suggestions: [
    { paragraph: "p0", current: "在结构上与其他哌甲酯类相关", suggested: "与其他哌甲酯类在结构上相关", reason: "More natural word order." },
    { paragraph: "p1", current: "50 mg", suggested: "60 mg", reason: "Smoother." },
    { paragraph: "p0", current: "其他哌甲酯类", suggested: "其他 phenidates", reason: "Shorter." },
  ],
};
const FLUENT = "2-苄基哌啶是一种兴奋剂，与其他哌甲酯类在结构上相关。";
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  for (const file of readdirSync("lib/postgres/migrations").filter((name) => name.endsWith(".sql")).sort())
    await database.exec(readFileSync(`lib/postgres/migrations/${file}`, "utf8"));
  // Adapt the pg transport only. Routes, access checks, stores, and SQL are production code.
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
}, 240_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  auth.requireRoleSession.mockImplementation(roleSessionFor("admin", admin));
  provider.callOpenRouterChat.mockReset();
  provider.callOpenRouterChat.mockResolvedValue({ content: JSON.stringify(REPLY), usage: { promptTokens: 1200, completionTokens: 90, totalTokens: 1290 } });
  seam.record = { slug: SLUG, summary: PHENIDATE_SOURCE, toxicity: [DOSE_SOURCE] };
  await database.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory", "translationSegments", "translationWorkerLeases"');
  await database.query(
    `INSERT INTO "translationGlossary" (locale, term, target, kind, status, source, reviewed_at, reviewed_by, updated_at) VALUES ($1,'Phenidate','哌甲酯类','chemical-class','approved','human',5,$2,10)`,
    [LOCALE, translator.email],
  );
  for (const [source, target] of [[PHENIDATE_SOURCE, PHENIDATE_TARGET], [DOSE_SOURCE, DOSE_TARGET]])
    await database.query(
      `INSERT INTO "translationSegments" (locale, hash, source, target, model, prompt_version, created_at) VALUES ($1,$2,$3,$4,'test-model','v1',1)`,
      [LOCALE, segment(source).hash, source, target],
    );
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await database?.close(); });

function segment(source: string) {
  const found = segmentsOf(seam.record as { slug: string }, "article").find((candidate) => candidate.source === source);
  if (!found) throw new Error(`no segment for ${source}`);
  return found;
}
const post = (path: string, body: unknown) => new Request(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
const review = (slug = SLUG) => POST(post("/api/dev/translation-fluency", { locale: LOCALE, slug }));
const accept = (id: string, expectedRevision: number) => acceptPost(post("/api/dev/translation-inbox/suggestion", { locale: LOCALE, id, expectedRevision }));
async function inbox(): Promise<InboxResponse> {
  const response = await inboxGet(new Request(`${origin}/api/dev/translation-inbox?locale=${LOCALE}&reason=model-suggestion`));
  expect(response.status).toBe(200);
  return response.json();
}
const count = async (table: string) => Number((await database.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n);
const asTranslator = () => auth.requireRoleSession.mockImplementation(roleSessionFor("translator", translator));

describe("model fluency review over isolated Postgres", () => {
  it("turns checked suggestions into inbox items, and drops one that changes a number or the glossary rendering", async () => {
    const response = await review();
    expect(response.status).toBe(200);
    const { run } = await response.json();
    expect(run).toMatchObject({
      slug: SLUG, reviewed: 2, stored: 1, dropped: { validator: 1, glossary: 1 },
      usage: { prompt: 1200, completion: 90, requests: 1 }, model: expect.any(String), promptVersion: expect.stringMatching(/^[a-f0-9]{16}$/),
    });
    // The model read the English beside the wording readers see, through the pipeline client.
    const [call] = provider.callOpenRouterChat.mock.calls[0];
    expect(call.systemPrompt).toContain("fluency");
    expect(call.userMessage).toContain(PHENIDATE_TARGET);
    expect(call.userMessage).toContain("Phenidate: 哌甲酯类");

    asTranslator();
    const { items, counts } = await inbox();
    expect(counts["model-suggestion"]).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      scope: "model", reason: "model-suggestion", english: PHENIDATE_SOURCE, live: PHENIDATE_TARGET, suggestion: FLUENT,
      origin: { model: run.model, runId: run.runId, promptVersion: run.promptVersion },
      href: expect.stringContaining(`translationSegment=${narrativeIdentity("article", segment(PHENIDATE_SOURCE))}`),
      accept: { kind: "suggestion-accept" },
    });
    expect(items[0].detail).toContain("More natural word order.");
    // Stored durably with its run's metadata and token use.
    const stored = await database.query<{ draft: { context: string } }>(`SELECT draft FROM "translationReviewEntries" WHERE scope = 'model-suggestion' AND source_id NOT LIKE 'run:%'`);
    expect(JSON.parse(stored.rows[0].draft.context)).toMatchObject({ runId: run.runId, promptVersion: run.promptVersion, usage: { prompt: 1200, completion: 90 } });

    // The suggestion expires when the wording readers see changes.
    await database.query(`UPDATE "translationSegments" SET target = $1 WHERE hash = $2`, ["2-苄基哌啶是一种兴奋剂，结构上与其他哌甲酯类相关。", segment(PHENIDATE_SOURCE).hash]);
    expect((await inbox()).total).toBe(0);
  });

  it("refuses a non-admin with 403 and fails closed under the write freeze", async () => {
    asTranslator();
    expect((await review()).status).toBe(403);
    auth.requireRoleSession.mockImplementation(roleSessionFor("admin", admin));
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    expect((await review()).status).toBe(503);
    expect(provider.callOpenRouterChat).not.toHaveBeenCalled();
    expect(await count("translationReviewEntries")).toBe(0);
  });

  it("Accept creates a Fluency draft, not an approval, and the item leaves the inbox", async () => {
    expect((await review()).status).toBe(200);
    asTranslator();
    const [item] = (await inbox()).items;
    if (item.accept?.kind !== "suggestion-accept") throw new Error("expected a suggestion accept");
    const response = await accept(item.accept.id, item.accept.expectedRevision);
    expect(response.status).toBe(200);
    const id = narrativeIdentity("article", segment(PHENIDATE_SOURCE));
    const [narrative] = (await database.query<{ draft: { target: string } | null; approved: unknown }>(`SELECT draft, approved FROM "translationReviewEntries" WHERE scope = 'narrative' AND source_id = $1`, [id])).rows;
    expect(narrative.draft?.target).toBe(FLUENT);
    expect(narrative.approved).toBeNull();
    const [history] = (await database.query<{ action: string; reason: string; actor: string }>(`SELECT action, reason, actor FROM "translationReviewHistory" WHERE scope = 'narrative'`)).rows;
    expect(history).toMatchObject({ action: "save", actor: translator.email });
    expect(decodeReviewReason(history.reason).reason).toMatchObject({ kind: "fluency", note: expect.stringContaining("More natural word order.") });
    expect((await inbox()).total).toBe(0);
    // Accepting again is refused and writes nothing.
    const before = await count("translationReviewHistory");
    expect((await accept(item.accept.id, item.accept.expectedRevision)).status).toBe(409);
    expect(await count("translationReviewHistory")).toBe(before);
  });

  it("refuses a second request for the same article while one runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    provider.callOpenRouterChat.mockImplementationOnce(async () => {
      started();
      await gate;
      return { content: JSON.stringify(REPLY), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    });
    const first = review();
    await running;
    const second = await review();
    expect(second.status).toBe(409);
    expect(provider.callOpenRouterChat).toHaveBeenCalledTimes(1);
    release();
    expect((await first).status).toBe(200);
    // Once the run finishes, the article can be reviewed again.
    expect((await review()).status).toBe(200);
  });
});
