// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { loadTranslationContext } from "@server/translation/liveTranslation";
import type { StyleGuidePacket } from "@server/translation/styleGuideTypes";
import { buildBatchPrompt } from "../../../../../scripts/translation/locales.mjs";
import { GET as narrativeGet, POST as narrativePost } from "../translation-narrative/route";
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
const MACHINE = "2-苄基哌啶是哌醋甲酯家族中的一种兴奋剂。";
const FLUENT = "2-苄基哌啶是一种兴奋剂，属于哌醋甲酯类。";
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
const jobs = async () => (await db.query('SELECT count(*)::int AS n FROM "translationJobs"')).rows[0] as { n: number };

describe("style guide route", () => {
  it("a Translator for the locale drafts and approves; only the approved guide reaches the prompt and its version", async () => {
    const unversioned = (await loadTranslationContext(LOCALE)).promptVersion;
    expect(await packet()).toMatchObject({ revision: 0, draft: null, approved: null, approvedRevision: "" });

    const saved = await post({ action: "save", expectedRevision: 0, guide: GUIDE });
    expect(saved.status).toBe(200);
    const draft = await packet();
    expect(draft).toMatchObject({ revision: 1, approved: null, approvedRevision: "", draft: { rules: [RULE] } });
    expect(draft.draft!.examples[0]).toMatchObject({ before: "返回复现", after: "复现作品", id: expect.stringMatching(/^manual:/), addedAt: expect.any(Number) });

    // A draft reaches neither the prompt nor its version.
    const drafted = await loadTranslationContext(LOCALE);
    expect(drafted.styleGuide).toBeNull();
    expect(drafted.promptVersion).toBe(unversioned);

    expect((await post({ action: "approve", expectedRevision: 1 })).status).toBe(200);
    const approved = await packet();
    expect(approved).toMatchObject({ revision: 2, draft: null, approved: { rules: [RULE] } });
    expect(approved.approvedRevision).toMatch(/^[0-9a-f]{16}$/);

    const context = await loadTranslationContext(LOCALE);
    expect(context.promptVersion).not.toBe(unversioned);
    const prompt = buildBatchPrompt(context.locale, [{ id: "s0", source: "Replications of visual effects.", contextClass: "prose" }], { styleGuide: context.styleGuide });
    expect(prompt).toContain(`- ${RULE}`);
    expect(prompt).toContain("After: 复现作品");
    // Approval marks translations stale by digest; it enqueues nothing.
    expect((await jobs()).n).toBe(0);

    // A new draft leaves the approved guide and the version alone.
    expect((await post({ action: "save", expectedRevision: 2, guide: { ...approved.approved, rules: ["A draft rule."] } })).status).toBe(200);
    expect((await loadTranslationContext(LOCALE)).promptVersion).toBe(context.promptVersion);

    // Restoring the first draft, then approving it, returns to the same version: the revision is the content.
    expect((await post({ action: "restore", expectedRevision: 3, restoreRevision: 1 })).status).toBe(200);
    expect((await post({ action: "approve", expectedRevision: 4 })).status).toBe(200);
    expect((await loadTranslationContext(LOCALE)).promptVersion).toBe(context.promptVersion);
    expect((await (await read(LOCALE, true)).json()).history.map((h: { action: string }) => h.action)).toEqual(["approve", "restore", "save", "approve", "save"]);

    // A stale revision writes nothing.
    expect((await post({ action: "approve", expectedRevision: 1 })).status).toBe(409);
  });

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

  it("rejects a malformed guide", async () => {
    const same = await post({ action: "save", expectedRevision: 0, guide: { rules: [], examples: [{ before: "同", after: "同", why: "x" }] } });
    expect(same.status).toBe(400);
    expect((await stored()).n).toBe(0);
  });

  it("promotes a saved Fluency correction to a draft example, once, and never a correction of another kind", async () => {
    const narrative = async (history?: string) => (await narrativeGet(new Request(`${origin}/api/dev/translation-narrative?${new URLSearchParams({ locale: LOCALE, kind: "article", slug: article.slug, ...(history ? { history } : {}) })}`))).json();
    const loaded = await narrative();
    const row = loaded.rows[0];
    await db.query('INSERT INTO "translationSegments" (locale,hash,source,target,model,prompt_version,created_at) VALUES ($1,$2,$3,$4,$5,$6,1)', [LOCALE, row.hash, SUMMARY, MACHINE, "test", "v"]);
    const correct = (expectedRevision: number, target: string, reason: Record<string, string>) => narrativePost(new Request(`${origin}/api/dev/translation-narrative`, {
      method: "POST", headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ locale: LOCALE, kind: "article", slug: article.slug, id: row.id, sourceVersion: loaded.sourceVersion, expectedRevision, action: "save", target, reason }),
    }));
    expect((await correct(0, FLUENT, { kind: "fluency", note: "Reads like a translation; lead with the class." })).status).toBe(200);
    expect((await correct(1, `${FLUENT}（注）`, { kind: "accuracy", note: "" })).status).toBe(200);
    const promote = (revision: number) => post({ action: "promote", correction: { kind: "article", slug: article.slug, segment: row.id, revision } });

    expect((await promote(2)).status).toBe(400);
    expect((await promote(1)).status).toBe(200);
    const guide = await packet();
    expect(guide).toMatchObject({ revision: 1, approved: null, approvedRevision: "" });
    expect(guide.draft!.examples).toEqual([expect.objectContaining({
      id: `narrative:${row.id}:1`, source: SUMMARY, before: MACHINE, after: FLUENT, why: "Reads like a translation; lead with the class.",
      origin: { kind: "article", slug: article.slug, segment: row.id, revision: 1 },
    })]);
    expect((await promote(1)).status).toBe(409);

    // Promotion appends to the current draft and leaves prompts alone until approval.
    expect((await loadTranslationContext(LOCALE)).styleGuide).toBeNull();
    auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "ru@example.test", glossaryLocales: ["ru"] }));
    expect((await promote(1)).status).toBe(403);
  });
});
