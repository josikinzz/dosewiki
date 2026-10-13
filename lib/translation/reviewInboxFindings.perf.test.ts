// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { PGlite } from "@electric-sql/pglite";
import { expect, it, vi } from "vitest";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { readReviewInbox } from "./reviewInbox";
import { scanInboxFindings } from "./reviewInboxFindings";
import { segmentsOf } from "./liveTranslation";
import type { CoverageInventory } from "./translationCoverage";

const transport = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({ getPostgresClient: () => transport }));

it("loads a locale-sized Waiting inbox with bounded source reads", async () => {
  const db = new PGlite();
  try {
    for (const file of readdirSync("lib/postgres/migrations").filter((name) => name.endsWith(".sql")).sort())
      await db.exec(readFileSync(`lib/postgres/migrations/${file}`, "utf8"));
    const archive = JSON.parse(readFileSync("public/SubstanceIndex.json", "utf8")) as Array<Record<string, unknown> & { slug: string }>;
    const articles = archive.slice(0, 200);
    const terms = Object.entries((JSON.parse(readFileSync("data/i18n/glossary/de.json", "utf8")) as { terms: Record<string, { target: string; kind: string }> }).terms)
      .map(([term, row]) => ({ term, target: row.target, kind: row.kind, revision: "1" }));
    const inventory: CoverageInventory = { generatedAt: Date.now(), records: articles.map((record) => ({
      kind: "article", slug: record.slug,
      units: segmentsOf(record, "article").map((segment) => ({ hash: segment.hash, source: segment.source })),
    })) };
    const stored = new Map(inventory.records.flatMap((record) => record.units.map((unit) => [unit.hash, unit.source] as const)));
    await db.exec('CREATE TABLE "perfArticles" (slug text PRIMARY KEY, document jsonb NOT NULL)');
    await db.query('INSERT INTO "perfArticles" SELECT slug, document FROM jsonb_to_recordset($1::jsonb) AS x(slug text, document jsonb)', [JSON.stringify(articles.map((document) => ({ slug: document.slug, document })))]);
    await db.query(`INSERT INTO "translationGlossary" (locale,term,target,kind,status,source,updated_at) SELECT 'de',term,target,kind,'approved','model',1 FROM jsonb_to_recordset($1::jsonb) AS x(term text,target text,kind text)`, [JSON.stringify(terms)]);
    await db.query(`INSERT INTO "translationSegments" (locale,hash,source,target,model,prompt_version,created_at) SELECT 'de',hash,target,target,'fixture','v1',1 FROM jsonb_to_recordset($1::jsonb) AS x(hash text,target text)`, [JSON.stringify([...stored].map(([hash, target]) => ({ hash, target })))]);
    let sqlCount = 0;
    let sourceReads = 0;
    transport.sql.mockImplementation(async (query: string, params: unknown[] = []) => { sqlCount += 1; return (await db.query(query, params)).rows; });
    const sourceQuery = async (query: string, params: unknown[] = []) => { sourceReads += 1; return (await db.query<{ slug: string; document: Record<string, unknown> }>(query, params)).rows; };
    const reads = {
      getPublicSubstanceSlugs: async () => (await sourceQuery('SELECT slug FROM "perfArticles" ORDER BY slug')).map((row) => row.slug),
      getPublicSubstanceBySlug: async (slug: string) => (await sourceQuery('SELECT document FROM "perfArticles" WHERE slug=$1', [slug]))[0]?.document ?? null,
      getPublicTranslationSubstanceDocuments: async () => {
        const records: Record<string, unknown>[] = [];
        for (let offset = 0; offset < articles.length; offset += 32)
          records.push(...(await sourceQuery('SELECT document FROM "perfArticles" ORDER BY slug LIMIT 32 OFFSET $1', [offset])).map((row) => row.document));
        return records;
      },
      getPublicEffects: async () => [], getPublicEffectBySlug: async () => null, getPublicEffectArticles: async () => [],
      getPublicTripReportRecords: async () => [], getPublishedEffectIndexArticles: async () => [],
      getPublicReplications: async () => [], getPublicContributorProfiles: async () => [],
    } as unknown as PublicDataReadAdapter;
    const cpuStart = performance.now();
    const findings = scanInboxFindings({ inventory, stored, rejections: new Map(), glossary: terms, chinese: false });
    const scanMs = Math.round(performance.now() - cpuStart);
    const start = performance.now();
    const body = await readReviewInbox(reads, "de");
    const coldMs = Math.round(performance.now() - start);
    const coldQueries = sqlCount + sourceReads;
    const coldSourceReads = sourceReads;
    sqlCount = 0; sourceReads = 0;
    const warmStart = performance.now();
    const warm = await readReviewInbox(reads, "de");
    console.log(JSON.stringify({ articles: articles.length, units: inventory.records.reduce((sum, record) => sum + record.units.length, 0), terms: terms.length, findings: findings.length, scanMs, coldMs, coldQueries, coldSourceReads, warmMs: Math.round(performance.now() - warmStart), warmQueries: sqlCount + sourceReads, payloadBytes: Buffer.byteLength(JSON.stringify(body)) }));
    expect(warm).toEqual(body);
    expect(body.items).toHaveLength(50);
    expect(coldSourceReads).toBeLessThanOrEqual(Math.ceil(articles.length / 32) + 2);
  } finally { await db.close(); }
}, 120_000);
