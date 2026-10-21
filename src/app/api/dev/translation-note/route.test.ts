import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { migratedPGlite, routeTransportToPGlite } from "@/test/pglite";
import type { TranslatorNotePacket } from "@server/translation/translatorNoteTypes";
import { readApprovedTranslatorNotes } from "@server/translation/translatorNotes";
import { localizeRecord } from "@server/translation/liveTranslation";
import { GET, POST } from "./route";

vi.setConfig({ testTimeout: 60_000 });
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
const source = vi.hoisted(() => ({ record: null as null | Record<string, unknown> }));
const cache = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: () => transport }));
vi.mock("@server/next/publishPublicCache", () => cache);
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
const url = `${origin}/api/dev/translation-note`;
const HISTORY = "2-Benzylpiperidine was first described in the 1950s as a possible antidepressant.";
const article = { slug: "2-benzylpiperidine", history_culture: { content: HISTORY } };
const NOTE = "在中国，2-苄基哌啶未被单独列管，但可能按类似物处理。";
let db: PGlite;

beforeAll(async () => {
  db = await migratedPGlite();
  routeTransportToPGlite(transport, db);
}, 180_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "sin@example.test", glossaryLocales: [LOCALE] }));
  source.record = { ...article };
  cache.publishPublicCache.mockClear();
  await db.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory", "translationSegments"');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db?.close(); });

const read = async (locale = LOCALE, history?: string) => GET(new Request(`${url}?${new URLSearchParams({ locale, kind: "article", slug: article.slug, ...(history ? { history } : {}) })}`));
const packet = async () => (await (await read()).json()) as TranslatorNotePacket & { history?: { revision: number; action: string }[] };
const note = async () => (await packet()).sections.find((row) => row.section === "history-culture")!;
const post = (body: Record<string, unknown>) => POST(new Request(url, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ locale: LOCALE, kind: "article", slug: article.slug, section: "history-culture", reason: "Local context", ...body }),
}));
const stored = async () => (await db.query('SELECT count(*)::int AS n FROM "translationReviewEntries" WHERE "scope" = \'note\'')).rows[0] as { n: number };
const readerNotes = async (locale = LOCALE) => readApprovedTranslatorNotes(locale, article.slug, source.record!);

describe("translator's notes route", () => {
  it("saves a draft readers do not see, approves it, and restores an earlier revision as a draft", async () => {
    const saved = await post({ action: "save", expectedRevision: 0, body: NOTE });
    expect(saved.status).toBe(200);
    expect(await note()).toMatchObject({ status: "draft", draft: NOTE, approved: null, revision: 1 });
    expect(await readerNotes()).toEqual({});

    expect((await post({ action: "approve", expectedRevision: 1 })).status).toBe(200);
    expect(await note()).toMatchObject({ status: "approved", draft: null, approved: NOTE, revision: 2 });
    expect(await readerNotes()).toEqual({ "history-culture": NOTE });
    expect(cache.publishPublicCache).toHaveBeenCalledWith({ targets: [{ kind: "article-translation", slug: article.slug, locale: LOCALE }], source: "manual" });

    const revised = "修订后的译者注。";
    expect((await post({ action: "save", expectedRevision: 2, body: revised })).status).toBe(200);
    expect((await post({ action: "approve", expectedRevision: 3 })).status).toBe(200);
    expect(await readerNotes()).toEqual({ "history-culture": revised });

    const restored = await post({ action: "restore", expectedRevision: 4, restoreRevision: 1 });
    expect(restored.status).toBe(200);
    expect(await note()).toMatchObject({ status: "draft", draft: NOTE, approved: revised, revision: 5 });
    expect(await readerNotes()).toEqual({ "history-culture": revised });
    expect((await (await read(LOCALE, "history-culture")).json()).history.map((h: { action: string }) => h.action)).toEqual(["restore", "approve", "save", "approve", "save"]);

    expect((await post({ action: "approve", expectedRevision: 4 })).status).toBe(409);
    expect((await note()).revision).toBe(5);
  });

  it("refuses a locale the translator is not assigned, for reads and writes", async () => {
    expect((await read("ru")).status).toBe(403);
    expect((await post({ locale: "ru", action: "save", expectedRevision: 0, body: "Примечание." })).status).toBe(403);
    auth.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    expect((await post({ action: "save", expectedRevision: 0, body: NOTE })).status).toBe(403);
    expect((await stored()).n).toBe(0);
  });

  it("fails closed while writes are frozen", async () => {
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    expect((await post({ action: "save", expectedRevision: 0, body: NOTE })).status).toBe(503);
    expect((await stored()).n).toBe(0);
  });

  it("never reaches another locale, the English page, or the translated article text", async () => {
    await post({ action: "save", expectedRevision: 0, body: NOTE });
    await post({ action: "approve", expectedRevision: 1 });
    expect(await readerNotes("ru")).toEqual({});
    expect(await readerNotes("en")).toEqual({});
    const localized = await localizeRecord({ ...article }, LOCALE, "article");
    expect(JSON.stringify(localized.record)).not.toContain(NOTE);
    expect(localized.review.total).toBe(1);
  });
});
