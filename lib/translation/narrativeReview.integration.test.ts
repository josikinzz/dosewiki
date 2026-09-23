// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroSummaryContent } from "@/features/article/components/sections/HeroSummaryContent";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { readNarrativeReview, writeNarrativeReview } from "./narrativeReview";
import { localizeRecord } from "./liveTranslation";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({ getPostgresClient: () => transport }));
let db: PGlite;
const record = { slug: "sample", summary: "This is a long source sentence about visual perception." };
const reads = { getPublicSubstanceBySlug: async () => record, getPublicSubstanceSlugs: async () => [record.slug], getPublicEffects: async () => [], getPublicTripReportRecords: async () => [], getPublishedEffectIndexArticles: async () => [], getPublicReplications: async () => [], getPublicContributorProfiles: async () => [] } as unknown as PublicDataReadAdapter;
beforeAll(async () => {
    db = new PGlite();
    for (const migration of ["0006_translation_segments", "0007_translation_rejections", "0020_translation_review_workspace"]) {
        // Review migration also alters the glossary table.
        if (migration === "0020_translation_review_workspace")
            await db.exec(await readFile(new URL("../postgres/migrations/0008_translation_glossary.sql", import.meta.url), "utf8"));
        await db.exec(await readFile(new URL(`../postgres/migrations/${migration}.sql`, import.meta.url), "utf8"));
    }
    transport.sql.mockImplementation(async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows);
    transport.sqlTransaction.mockImplementation((op: (tx: unknown) => Promise<unknown>) => db.transaction(tx => op({ query: tx.query.bind(tx) })));
}, 30000);
beforeEach(async () => { process.env.DATA_WRITES_FROZEN = "0"; await db.exec('TRUNCATE "translationReviewEntries", "translationReviewHistory", "translationSegments"'); });
afterAll(async () => { delete process.env.DATA_WRITES_FROZEN; await db?.close(); });
it("publishes only an approved contextual revision and preserves it over machine refresh", async () => {
    const packet = await readNarrativeReview(reads, "zh-Hans", "article", "sample");
    const row = packet.rows[0];
    const input = { locale: "zh-Hans", kind: "article" as const, slug: "sample", id: row.id, sourceVersion: packet.sourceVersion, actor: "reviewer@example.test", reason: "Preserve meaning", expectedRevision: 0, action: "save" as const, target: "这是一段有关视觉感知的较长说明。" };
    const saved = await writeNarrativeReview(reads, input);
    expect((await localizeRecord(record, "zh-Hans", "article")).record.summary).toBe(record.summary);
    await writeNarrativeReview(reads, { ...input, action: "approve", expectedRevision: saved.revision });
    expect((await localizeRecord(record, "zh-Hans", "article")).record.summary).toBe(input.target);
    const localized = await localizeRecord(record, "zh-Hans", "article");
    const html = renderToStaticMarkup(createElement(HeroSummaryContent, {article: {...createEmptyArticle(), summary: localized.record.summary}, hasMolecule: false}));
    expect(html).toContain(input.target);
    expect(html).not.toContain(record.summary);
    expect((await localizeRecord({ ...record, slug: "another" }, "zh-Hans", "article")).record.summary).toBe(record.summary);
    await db.query('INSERT INTO "translationSegments" (locale,hash,source,target,model,prompt_version,created_at) VALUES ($1,$2,$3,$4,$5,$6,1)', ["zh-Hans", row.hash, record.summary, "机器翻译", "test", "new"]);
    expect((await localizeRecord(record, "zh-Hans", "article")).record.summary).toBe(input.target);
});
it("rejects stale revisions and source context, preserves approval on draft and restore, and honors freeze", async () => {
    const packet = await readNarrativeReview(reads, "zh-Hans", "article", "sample");
    const row = packet.rows[0];
    const input = { locale: "zh-Hans", kind: "article" as const, slug: "sample", id: row.id, sourceVersion: packet.sourceVersion, actor: "reviewer@example.test", reason: "Meaning", expectedRevision: 0, action: "save" as const, target: "这是一段有关视觉感知的较长说明。" };
    const saved = await writeNarrativeReview(reads, input);
    await expect(writeNarrativeReview(reads, { ...input, action: "approve" })).rejects.toMatchObject({ status: 409 });
    const approved = await writeNarrativeReview(reads, { ...input, action: "approve", expectedRevision: saved.revision });
    await writeNarrativeReview(reads, { ...input, expectedRevision: approved.revision, target: "不同的草稿内容" });
    expect((await localizeRecord(record, "zh-Hans", "article")).record.summary).toBe(input.target);
    await expect(writeNarrativeReview(reads, { ...input, sourceVersion: "stale" })).rejects.toMatchObject({ status: 409 });
    const changed = { ...record, summary: "The source meaning has changed completely." };
    expect((await localizeRecord(changed, "zh-Hans", "article")).record.summary).toBe(changed.summary);
    process.env.DATA_WRITES_FROZEN = "1";
    await expect(writeNarrativeReview(reads, { ...input, expectedRevision: 3 })).rejects.toThrow();
});
it("keeps approved fields in reduced previews and canonicalizes contributor keys", async () => {
    const full = { slug: "effect", name: "Visual perception", summary: "This describes perception in more detail." };
    const sources = { ...reads, getPublicEffectBySlug: async () => full, getPublicContributorProfiles: async () => [{ key: "PROFILE", bio: "This contributor writes about perception." }] } as unknown as PublicDataReadAdapter;
    const packet = await readNarrativeReview(sources, "zh-Hans", "effect", "effect");
    const row = packet.rows.find(r => r.field === "name")!;
    const input = { locale: "zh-Hans", kind: "effect" as const, slug: "effect", id: row.id, sourceVersion: packet.sourceVersion, actor: "reviewer@example.test", reason: "Name context", expectedRevision: 0, action: "save" as const, target: "视觉感知" };
    const saved = await writeNarrativeReview(sources, input);
    await writeNarrativeReview(sources, { ...input, action: "approve", expectedRevision: saved.revision });
    expect((await localizeRecord({ slug: "effect", name: full.name }, "zh-Hans", "effect")).record.name).toBe(input.target);
    const profile = await readNarrativeReview(sources, "zh-Hans", "profile", "profile");
    expect(profile.slug).toBe("PROFILE");
    const p = profile.rows[0];
    const change = { ...input, kind: "profile" as const, slug: "profile", id: p.id, sourceVersion: profile.sourceVersion, target: "这位贡献者撰写有关感知的文章。" };
    const draft = await writeNarrativeReview(sources, change);
    await writeNarrativeReview(sources, { ...change, action: "approve", expectedRevision: draft.revision });
    expect((await localizeRecord({ slug: "PROFILE", bio: p.source }, "zh-Hans", "profile")).record.bio).toBe(change.target);
});
it("serializes competing review revisions and retains approval during a concurrent machine update", async () => {
    const packet = await readNarrativeReview(reads, "zh-Hans", "article", "sample"), row = packet.rows[0];
    const input = { locale: "zh-Hans", kind: "article" as const, slug: "sample", id: row.id, sourceVersion: packet.sourceVersion, actor: "reviewer@example.test", reason: "Race", expectedRevision: 0, action: "save" as const, target: "这是一段有关视觉感知的较长说明。" };
    const results = await Promise.allSettled([writeNarrativeReview(reads, input), writeNarrativeReview(reads, { ...input, target: "另一个审阅草稿" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const draft = (await readNarrativeReview(reads, "zh-Hans", "article", "sample")).rows[0];
    await Promise.all([
        writeNarrativeReview(reads, { ...input, action: "approve", expectedRevision: draft.revision }),
        db.query('INSERT INTO "translationSegments" (locale,hash,source,target,model,prompt_version,created_at) VALUES ($1,$2,$3,$4,$5,$6,1)', ["zh-Hans", row.hash, record.summary, "机器翻译", "test", "new"]),
    ]);
    expect((await localizeRecord(record, "zh-Hans", "article")).record.summary).toBe(draft.draft!.target);
});
it("restores history as a draft and rejects structural defects without losing approval", async () => {
    const packet = await readNarrativeReview(reads, "zh-Hans", "article", "sample"), row = packet.rows[0];
    const input = { locale: "zh-Hans", kind: "article" as const, slug: "sample", id: row.id, sourceVersion: packet.sourceVersion, actor: "reviewer@example.test", reason: "Meaning", expectedRevision: 0, action: "save" as const, target: "这是一段有关视觉感知的较长说明。" };
    await writeNarrativeReview(reads, input);
    await writeNarrativeReview(reads, { ...input, action: "approve", expectedRevision: 1 });
    await writeNarrativeReview(reads, { ...input, expectedRevision: 2, target: "坏的翻译 {{injected}}" });
    await expect(writeNarrativeReview(reads, { ...input, action: "approve", expectedRevision: 3 })).rejects.toThrow("PLACEHOLDER");
    await writeNarrativeReview(reads, { ...input, action: "restore", expectedRevision: 3, restoreRevision: 1 });
    const restored = (await readNarrativeReview(reads, "zh-Hans", "article", "sample")).rows[0];
    expect(restored.draft?.target).toBe(input.target);
    expect(restored.approved?.target).toBe(input.target);
    expect(restored.revision).toBe(4);
});
