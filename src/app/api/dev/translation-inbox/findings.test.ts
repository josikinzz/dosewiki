// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { renderingVersion } from "@/features/language-glossary/languageGlossary";
import { PostgresClient } from "@server/postgres/runtime/client";
import { segmentsOf } from "@server/translation/liveTranslation";
import { narrativeIdentity } from "@server/translation/narrativeIdentity";
import type { InboxItem, InboxResponse } from "@server/translation/reviewInboxTypes";
import { POST as feedbackPost } from "../../glossary-feedback/route";
import { POST as feedbackStatusPost } from "../../glossary-feedback/[id]/status/route";
import { POST as approvePost } from "../translation-glossary/approve/route";
import { POST as editPost } from "../translation-glossary/edit/route";
import { GET as narrativeGet, POST as narrativePost } from "../translation-narrative/route";
import { POST as exceptionPost } from "./exception/route";
import { GET } from "./route";

vi.setConfig({ testTimeout: 90_000 });
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const seam = vi.hoisted(() => ({ client: null as unknown, record: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null), getClientIp: () => "127.0.0.1" }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: () => seam.client }));
vi.mock("@server/next/publishPublicCache", () => ({ publishPublicCache: vi.fn(async () => []) }));
// Only the capability lookup is adapted; the feedback queries, mutations, role and locale checks are production code.
vi.mock("@server/data/serverWriteCapability", async (original) => {
  const real = await original<typeof import("@server/data/serverWriteCapability")>();
  const client = () => new real.ServerDataWriteClient(seam.client as PostgresClient);
  return {
    ...real,
    getPublicIntakeWriteCapability: () => ({ apiKey: "test-intake", client: client() }),
    getServerDataWriteCapability: () => ({ ok: true, capability: { client: client(), adminKey: "test-review", getAdminIntentToken: () => "test-review" } }),
  };
});
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
const reviewer = { email: "sin@example.test", glossaryLocales: [LOCALE] };
const origin = "https://dev.dose.wiki";
const SLUG = "2-benzylpiperidine";
// The sentence from Sin's report: "phenidates" left in English, and the glossary rendering missing.
const PHENIDATE_SOURCE = "2-Benzylpiperidine is a stimulant that is structurally related to other phenidates.";
const PHENIDATE_TARGET = "2-苄基哌啶是一种兴奋剂，在结构上与其他 phenidates 相关。";
const REJECTED_SOURCE = "It has been sold online as a designer drug since the early 2010s.";
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
  await database.query(
    `INSERT INTO "memberships" ("_id", "_creationTime", email, role, "glossaryLocales", "createdAt", "updatedAt") VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1, $1, 'translator', $2, 'now', 'now')`,
    [reviewer.email, JSON.stringify(reviewer.glossaryLocales)],
  );
}, 240_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  vi.stubEnv("DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE", "test-intake");
  vi.stubEnv("DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE", "test-review");
  vi.stubEnv("SITE_FEEDBACK_IP_HASH_SECRET", "test-hash-secret");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  auth.requireRoleSession.mockImplementation(roleSessionFor("translator", reviewer));
  seam.record = { slug: SLUG, summary: PHENIDATE_SOURCE, toxicity: [REJECTED_SOURCE] };
  await database.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory", "translationSegments", "translationRejections", "glossaryFeedback"');
  await database.query(
    `INSERT INTO "translationGlossary" (locale, term, target, kind, status, source, reviewed_at, reviewed_by, updated_at) VALUES ($1,'Phenidate','哌甲酯类','chemical-class','approved','human',5,$2,10)`,
    [LOCALE, reviewer.email],
  );
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await database?.close(); });

const segment = (source: string) => {
  const found = segmentsOf(seam.record as { slug: string }, "article").find((candidate) => candidate.source === source);
  if (!found) throw new Error(`no segment for ${source}`);
  return found;
};
async function store(source: string, target: string) {
  await database.query(
    `INSERT INTO "translationSegments" (locale, hash, source, target, model, prompt_version, created_at) VALUES ($1,$2,$3,$4,'test-model','v1',1)`,
    [LOCALE, segment(source).hash, source, target],
  );
}
async function reject(source: string) {
  await database.query(
    `INSERT INTO "translationRejections" (locale, hash, source, defects, attempts, last_tried_at) VALUES ($1,$2,$3,'REPEATED_PUNCTUATION',3,20)`,
    [LOCALE, segment(source).hash, source],
  );
}
const read = async (reason?: string): Promise<InboxResponse> => {
  const response = await GET(new Request(`${origin}/api/dev/translation-inbox?locale=${LOCALE}${reason ? `&reason=${reason}` : ""}`));
  expect(response.status).toBe(200);
  return response.json();
};
const post = (path: string, body: unknown) => new Request(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
const fineHere = (item: InboxItem, locale = LOCALE) => exceptionPost(post("/api/dev/translation-inbox/exception", { locale, ...item.exception }));
/** Saves and approves a human correction for one article sentence through the Narratives route. */
async function correct(english: string, target: string, glossaryExceptions?: string[]) {
  const packet = await (await narrativeGet(new Request(`${origin}/api/dev/translation-narrative?locale=${LOCALE}&kind=article&slug=${SLUG}`))).json();
  const row = packet.rows.find((candidate: { source: string }) => candidate.source === english);
  const base = { locale: LOCALE, kind: "article", slug: SLUG, id: row.id, sourceVersion: packet.sourceVersion, reason: { kind: "terminology" } };
  const saved = await narrativePost(post("/api/dev/translation-narrative", { ...base, action: "save", expectedRevision: 0, target, ...(glossaryExceptions ? { glossaryExceptions } : {}) }));
  expect(saved.status).toBe(200);
  const approved = await narrativePost(post("/api/dev/translation-narrative", { ...base, action: "approve", expectedRevision: (await saved.json()).entry.revision }));
  expect(approved.status).toBe(200);
}
const historyCount = async () => Number((await database.query<{ n: number }>('SELECT count(*)::int AS n FROM "translationReviewHistory"')).rows[0].n);

describe("inbox findings over isolated Postgres", () => {
  it("lists one glossary item for a stored sentence that mentions an approved term but lacks its rendering, at that sentence", async () => {
    await store(PHENIDATE_SOURCE, PHENIDATE_TARGET);
    const body = await read();
    const glossary = body.items.filter((item) => item.reason === "glossary-disagreement");
    expect(glossary).toHaveLength(1);
    const phenidate = segment(PHENIDATE_SOURCE);
    expect(glossary[0]).toMatchObject({
      scope: "segment", english: PHENIDATE_SOURCE, live: PHENIDATE_TARGET, accept: null,
      exception: { finding: "glossary-disagreement", hash: phenidate.hash, term: "Phenidate", revision: expect.stringMatching(/^5:[a-f0-9]{16}$/) },
    });
    expect(glossary[0].detail).toContain("哌甲酯类");
    // Edit opens the Narratives view at this sentence.
    expect(glossary[0].href).toContain(`translationSegment=${narrativeIdentity("article", phenidate)}`);
    expect(glossary[0].where).toContain(SLUG);
    // The English "phenidates" left in the Chinese is its own finding.
    expect(body.items.filter((item) => item.reason === "leftover-latin").map((item) => item.detail)).toEqual(["English left in: phenidates"]);
    expect(body.counts["glossary-disagreement"]).toBe(1);
    expect(body.checked).toEqual(expect.arrayContaining(["segment-rejected", "glossary-disagreement", "leftover-latin", "reader-suggestion"]));

    // A translation that carries the rendering is not listed.
    await database.query(`UPDATE "translationSegments" SET target = $1`, ["2-苄基哌啶是一种兴奋剂，在结构上与其他哌甲酯类相关。"]);
    expect((await read("glossary-disagreement")).total).toBe(0);
  });

  it("keeps an item away after Fine here, and brings it back when the rendering changes", async () => {
    await store(PHENIDATE_SOURCE, PHENIDATE_TARGET);
    const [item] = (await read("glossary-disagreement")).items;
    expect((await fineHere(item)).status).toBe(200);
    const recorded = await database.query<{ actor: string; reason: string }>(`SELECT actor, reason FROM "translationReviewHistory" WHERE scope = 'qa-exception' ORDER BY revision`);
    expect(recorded.rows.map((row) => row.actor)).toEqual([reviewer.email, reviewer.email]);
    expect((await read("glossary-disagreement")).total).toBe(0);
    expect((await read()).items.some((other) => other.id === item.id)).toBe(false);

    // A saved draft is not a new rendering; approving new wording is.
    expect((await editPost(post("/api/dev/translation-glossary/edit", { locale: LOCALE, term: "Phenidate", target: "苯乙胺类哌啶", expectedRevision: "10:0" }))).status).toBe(200);
    expect((await read("glossary-disagreement")).total).toBe(0);
    expect((await approvePost(post("/api/dev/translation-glossary/approve", { locale: LOCALE, terms: ["Phenidate"], expectedRevisions: { Phenidate: "10:1" } }))).status).toBe(200);
    const back = await read("glossary-disagreement");
    expect(back.total).toBe(1);
    expect(back.items[0].detail).toContain("苯乙胺类哌啶");
    expect(back.items[0].exception?.revision).not.toBe(item.exception?.revision);

    // Fine here at the old revision is refused and writes nothing.
    const before = await historyCount();
    expect((await fineHere(item)).status).toBe(409);
    expect(await historyCount()).toBe(before);
  });

  it("brings a Fine here glossary item back when the stored translation changes", async () => {
    await store(PHENIDATE_SOURCE, PHENIDATE_TARGET);
    const [item] = (await read("glossary-disagreement")).items;
    expect((await fineHere(item)).status).toBe(200);
    expect((await read("glossary-disagreement")).total).toBe(0);
    // A retranslation that still lacks the rendering is a new finding.
    await database.query(`UPDATE "translationSegments" SET target = $1`, ["2-苄基哌啶是一种兴奋剂，与其他 phenidate 类药物结构相关。"]);
    const back = await read("glossary-disagreement");
    expect(back.total).toBe(1);
    expect(back.items[0].exception?.revision).not.toBe(item.exception?.revision);
    // Fine here at the old translation is refused and writes nothing.
    const before = await historyCount();
    expect((await fineHere(item)).status).toBe(409);
    expect(await historyCount()).toBe(before);
  });

  it("checks the human correction readers see, not the machine target it replaced", async () => {
    await store(PHENIDATE_SOURCE, PHENIDATE_TARGET);
    await correct(PHENIDATE_SOURCE, "2-苄基哌啶是一种兴奋剂，在结构上与其他哌甲酯类相关。");
    const body = await read();
    expect(body.items.filter((item) => item.reason === "glossary-disagreement")).toEqual([]);
    expect(body.items.filter((item) => item.reason === "leftover-latin")).toEqual([]);
  });

  it("does not list a human correction saved with a glossary exception for that term", async () => {
    await store(PHENIDATE_SOURCE, PHENIDATE_TARGET);
    await correct(PHENIDATE_SOURCE, "2-苄基哌啶是一种兴奋剂，在结构上与其他哌醋甲酯类相关。", ["Phenidate"]);
    expect((await read("glossary-disagreement")).total).toBe(0);
  });

  it("lists English left in a human correction, and Fine here records it against that wording", async () => {
    await store(PHENIDATE_SOURCE, "2-苄基哌啶是一种兴奋剂，在结构上与其他哌甲酯类相关。");
    const human = "2-苄基哌啶是一种兴奋剂，在结构上与其他 phenidates 哌甲酯类相关。";
    await correct(PHENIDATE_SOURCE, human);
    const [item] = (await read("leftover-latin")).items;
    expect(item).toMatchObject({ live: human, detail: "English left in: phenidates" });
    expect((await fineHere(item)).status).toBe(200);
    expect((await read("leftover-latin")).total).toBe(0);
  });

  it("ranks a rejected segment that fell back to English above glossary items", async () => {
    await store(PHENIDATE_SOURCE, PHENIDATE_TARGET);
    await reject(REJECTED_SOURCE);
    const { items } = await read();
    expect(items[0]).toMatchObject({ reason: "segment-rejected", english: REJECTED_SOURCE, live: null, accept: null });
    expect(items[0].detail).toContain("REPEATED_PUNCTUATION");
    expect(items[0].href).toContain(`translationSegment=${narrativeIdentity("article", segment(REJECTED_SOURCE))}`);
    const reasons = items.map((item) => item.reason);
    expect(reasons.indexOf("segment-rejected")).toBeLessThan(reasons.indexOf("glossary-disagreement"));
    expect(reasons.indexOf("glossary-disagreement")).toBeLessThan(reasons.indexOf("leftover-latin"));
    // A rejection with a stored translation still shows that translation, so it is not listed.
    await store(REJECTED_SOURCE, "自 2010 年代初以来，它一直作为策划药在网上销售。");
    expect((await read("segment-rejected")).total).toBe(0);
  });

  it("lists a suggestion sent through the public feedback route first, ahead of every automated finding, and Resolve updates its feedback status", async () => {
    await store(PHENIDATE_SOURCE, PHENIDATE_TARGET);
    const visitor = randomUUID();
    const submitted = await feedbackPost(new NextRequest("https://dose.wiki/api/glossary-feedback", {
      method: "POST",
      headers: { origin: "https://dose.wiki", "Content-Type": "application/json", cookie: `glossary-visitor=${visitor}` },
      body: JSON.stringify({
        id: randomUUID(), locale: LOCALE, term: "Phenidate", action: "suggestion", details: "哌醋甲酯类 reads more naturally", alternative: "哌醋甲酯类",
        version: renderingVersion({ term: "Phenidate", updated_at: 10, target: "哌甲酯类", kind: "chemical-class", status: "approved" }),
      }),
    }));
    expect(submitted.status).toBe(202);

    const body = await read();
    // The stored translation also yields an automated finding; the reader's suggestion still leads.
    expect(body.items.length).toBeGreaterThan(1);
    const first = body.items[0];
    expect(first).toMatchObject({ scope: "feedback", reason: "reader-suggestion", english: "Phenidate", live: "哌甲酯类", suggestion: "哌醋甲酯类" });
    expect(first.href).toContain("translationTerm=Phenidate");
    if (first.accept?.kind !== "feedback-resolve") throw new Error("expected a feedback resolve");

    // Resolve goes through the existing feedback status mutation.
    const resolved = await feedbackStatusPost(post(`/api/glossary-feedback/${first.accept.id}/status`, { status: "resolved", note: "Resolved from the Inbox" }));
    expect(resolved.status).toBe(200);
    expect((await database.query(`SELECT status, reviewed_by FROM "glossaryFeedback"`)).rows).toEqual([{ status: "resolved", reviewed_by: reviewer.email }]);
    expect((await read("reader-suggestion")).total).toBe(0);
  });

  it("refuses Fine here for an unassigned locale, a contributor, and under the write freeze", async () => {
    await store(PHENIDATE_SOURCE, PHENIDATE_TARGET);
    const [item] = (await read("glossary-disagreement")).items;
    expect((await fineHere(item, "nl")).status).toBe(403);
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    expect((await fineHere(item)).status).toBe(503);
    vi.stubEnv("DATA_WRITES_FROZEN", "0");
    auth.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    expect((await fineHere(item)).status).toBe(403);
    expect(await historyCount()).toBe(0);
  });
});
