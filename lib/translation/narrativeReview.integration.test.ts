// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroSummaryContent } from "@/features/article/components/sections/HeroSummaryContent";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { readNarrativeReview, writeNarrativeReview } from "./narrativeReview";
import { localizeRecord, segmentsOf } from "./liveTranslation";
import { legacyNarrativeContext, narrativeFieldVersion, narrativeIdentity } from "./narrativeIdentity";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({ getPostgresClient: () => transport }));
let db: PGlite;
const record = { slug: "sample", summary: "This is a long source sentence about visual perception." };
const reads = { getPublicSubstanceBySlug: async () => record, getPublicSubstanceSlugs: async () => [record.slug], getPublicEffects: async () => [], getPublicTripReportRecords: async () => [], getPublishedEffectIndexArticles: async () => [], getPublicReplications: async () => [], getPublicContributorProfiles: async () => [] } as unknown as PublicDataReadAdapter;
beforeAll(async () => {
    db = new PGlite();
    // Every migration: the read now lists the glossary rows each paragraph mentions.
    for (const file of (await readdir(new URL("../postgres/migrations/", import.meta.url))).filter(name => name.endsWith(".sql")).sort())
        await db.exec(await readFile(new URL(`../postgres/migrations/${file}`, import.meta.url), "utf8"));
    transport.sql.mockImplementation(async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows);
    transport.sqlTransaction.mockImplementation((op: (tx: unknown) => Promise<unknown>) => db.transaction(tx => op({ query: tx.query.bind(tx) })));
}, 120000);
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
it("keeps an approval applied for re-check after a neighbour edit and drops it after an own-source edit", async () => {
    const approvedSource = "2-Benzylpiperidine is a stimulant of the piperidine class.";
    const grouped = { slug: "sample", summary: "This is a long source sentence about visual perception.", toxicity: [approvedSource, "It is structurally related to methylphenidate."] };
    let current: typeof grouped = grouped;
    const groupedReads = { ...reads, getPublicSubstanceBySlug: async () => current } as unknown as PublicDataReadAdapter;
    const packet = await readNarrativeReview(groupedReads, "zh-Hans", "article", "sample");
    const row = packet.rows.find(r => r.source === approvedSource)!;
    const target = "2-苄基哌啶是一种哌啶类兴奋剂。";
    const input = { locale: "zh-Hans", kind: "article" as const, slug: "sample", id: row.id, sourceVersion: packet.sourceVersion, actor: "reviewer@example.test", reason: "Terminology", expectedRevision: 0, action: "save" as const, target };
    const saved = await writeNarrativeReview(groupedReads, input);
    await writeNarrativeReview(groupedReads, { ...input, action: "approve", expectedRevision: saved.revision });
    const reviewed = async () => (await readNarrativeReview(groupedReads, "zh-Hans", "article", "sample")).rows.find(r => r.id === row.id);
    expect(await reviewed()).toMatchObject({ status: "approved", overlay: "apply" });
    current = { ...grouped, toxicity: [approvedSource, "It is structurally related to methylphenidate and other phenidates."] };
    expect((await localizeRecord(current, "zh-Hans", "article")).record.toxicity[0]).toBe(target);
    expect(await reviewed()).toMatchObject({ status: "recheck", overlay: "apply-recheck" });
    // Re-check wording stays live but is not counted as human approved.
    expect((await readNarrativeReview(groupedReads, "zh-Hans", "article", "sample")).tally.humanApproved).toBe(0);
    current = { ...grouped, toxicity: ["2-Benzylpiperidine is a weak stimulant of the piperidine class.", grouped.toxicity[1]] };
    expect((await localizeRecord(current, "zh-Hans", "article")).record.toxicity[0]).not.toBe(target);
    expect(await reviewed()).toMatchObject({ status: "stale", overlay: "stale" });
});
it("keeps the whole-group rule for approvals stored in the old context shape", async () => {
    const approvedSource = "2-Benzylpiperidine is a stimulant of the piperidine class.";
    const grouped = { slug: "sample", toxicity: [approvedSource, "It is structurally related to methylphenidate."] };
    const segments = segmentsOf(grouped, "article"), segment = segments[0];
    const target = "2-苄基哌啶是一种哌啶类兴奋剂。";
    const approved = { source: approvedSource, target, context: legacyNarrativeContext("article", segment, narrativeFieldVersion(segments, segment)) };
    await db.query('INSERT INTO "translationReviewEntries" (locale,scope,source_id,revision,draft,approved,updated_at) VALUES ($1,\'narrative\',$2,1,NULL,$3::jsonb,1)', ["zh-Hans", narrativeIdentity("article", segment), JSON.stringify(approved)]);
    expect((await localizeRecord(grouped, "zh-Hans", "article")).record.toxicity[0]).toBe(target);
    const edited = { ...grouped, toxicity: [approvedSource, "It is structurally related to methylphenidate and other phenidates."] };
    expect((await localizeRecord(edited, "zh-Hans", "article")).record.toxicity[0]).toBe(approvedSource);
});
it("derives page review state from current approvals, counting a re-check as not reviewed", async () => {
    const first = "2-Benzylpiperidine is a stimulant of the piperidine class.";
    const grouped = { slug: "sample", toxicity: [first, "It is structurally related to methylphenidate."] };
    let current: typeof grouped = grouped;
    const groupedReads = { ...reads, getPublicSubstanceBySlug: async () => current } as unknown as PublicDataReadAdapter;
    expect((await localizeRecord(grouped, "zh-Hans", "article")).review).toEqual({ reviewed: 0, total: 2, latestApprovedAt: null });
    const review = async (source: string, target: string, action: "save" | "approve" = "approve") => {
        const packet = await readNarrativeReview(groupedReads, "zh-Hans", "article", "sample");
        const row = packet.rows.find(r => r.source === source)!;
        const input = { locale: "zh-Hans", kind: "article" as const, slug: "sample", id: row.id, sourceVersion: packet.sourceVersion, actor: "reviewer@example.test", reason: "Review", expectedRevision: row.revision, action: "save" as const, target };
        const saved = await writeNarrativeReview(groupedReads, input);
        return action === "save" ? saved : writeNarrativeReview(groupedReads, { ...input, action: "approve", expectedRevision: saved.revision });
    };
    const one = await review(first, "2-苄基哌啶是一种哌啶类兴奋剂。");
    expect((await localizeRecord(grouped, "zh-Hans", "article")).review).toEqual({ reviewed: 1, total: 2, latestApprovedAt: one.updatedAt });
    const two = await review(grouped.toxicity[1], "它在结构上与哌甲酯相关。");
    const full = (await localizeRecord(grouped, "zh-Hans", "article")).review;
    expect(full).toEqual({ reviewed: 2, total: 2, latestApprovedAt: two.updatedAt });
    // A later draft on an approved paragraph is not an approval and leaves the date alone.
    await new Promise(resolve => setTimeout(resolve, 5));
    await review(first, "草稿", "save");
    expect((await localizeRecord(grouped, "zh-Hans", "article")).review).toEqual(full);
    current = { ...grouped, toxicity: [first, "It is structurally related to methylphenidate and other phenidates."] };
    // The edited paragraph is stale; its unedited neighbour still shows the human text but needs a re-check.
    const edited = await localizeRecord(current, "zh-Hans", "article");
    expect(edited.record.toxicity[0]).toBe("2-苄基哌啶是一种哌啶类兴奋剂。");
    expect(edited.review).toMatchObject({ reviewed: 0, total: 2 });
});
it("tallies the paragraphs whose human approval applies to the current source", async () => {
    const packet = await readNarrativeReview(reads, "zh-Hans", "article", "sample");
    expect(packet.tally).toEqual({ humanApproved: 0, total: packet.rows.length });
    const row = packet.rows[0];
    const input = { locale: "zh-Hans", kind: "article" as const, slug: "sample", id: row.id, sourceVersion: packet.sourceVersion, actor: "reviewer@example.test", reason: "Meaning", expectedRevision: 0, action: "save" as const, target: "这是一段有关视觉感知的较长说明。" };
    const saved = await writeNarrativeReview(reads, input);
    expect((await readNarrativeReview(reads, "zh-Hans", "article", "sample")).tally.humanApproved).toBe(0);
    const approved = await writeNarrativeReview(reads, { ...input, action: "approve", expectedRevision: saved.revision });
    expect((await readNarrativeReview(reads, "zh-Hans", "article", "sample")).tally).toEqual({ humanApproved: 1, total: packet.rows.length });
    // A newer draft does not withdraw the approval readers already see.
    await writeNarrativeReview(reads, { ...input, expectedRevision: approved.revision, target: "新的草稿内容" });
    expect((await readNarrativeReview(reads, "zh-Hans", "article", "sample")).tally.humanApproved).toBe(1);
    // Changed English makes the approval stale, so it no longer counts.
    const changed = { ...reads, getPublicSubstanceBySlug: async () => ({ ...record, summary: "The source meaning has changed completely." }) } as unknown as PublicDataReadAdapter;
    expect((await readNarrativeReview(changed, "zh-Hans", "article", "sample")).tally.humanApproved).toBe(0);
});
