import { describe, expect, it, vi } from "vitest";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { buildCoverageInventory, getCoverageInventory, getTranslationCoverage, getTranslationHashUsages, summarizeTranslationCoverage } from "./translationCoverage";
import type { TranslationContext } from "./liveTranslation";

const store = vi.hoisted(() => ({
  readTranslationCoverageRows: vi.fn(async () => []),
  readTranslationRejections: vi.fn(async () => new Map()),
  translationQueueCoverage: vi.fn(async () => ({ queued: 0, running: 0, failed: 0, completed: 99, retrying: 0 })),
}));
vi.mock("./segmentStore", () => store);
const context: TranslationContext = { locale: resolveLocale("zh-Hans"), glossary: {}, kinds: {}, glosses: {}, promptVersion: "now" };
function adapter(): PublicDataReadAdapter {
  return {
    getPublicSubstanceSlugs: vi.fn(async () => ["article"]),
    getPublicSubstanceBySlug: async () => ({ slug: "article", summary: "A substance article with a source segment." }),
    getPublicEffects: async () => [{ slug: "effect" }],
    getPublicEffectBySlug: async () => ({ slug: "effect", summary: "An effect article with a source segment." }),
    getPublicTripReportRecords: async () => [{ slug: "report", summary: "A personal report with a source segment." }],
    getPublishedEffectIndexArticles: async () => [
      { slug: "library", kind: "article", summary: "A library article with a source segment." },
      { slug: "excluded-blog", kind: "blog", summary: "An excluded blog." },
    ],
    getPublicReplications: async () => [
      { slug: "replication", type: "video", title: "A moving replication with visual trails." },
      { slug: "excluded-figure", type: "image", role: "figure", title: "An excluded figure." },
    ],
    getPublicContributorProfiles: async () => [{ key: "PROFILE", bio: "A contributor biography with a source segment.", name: "Canonical Name" }],
  } as unknown as PublicDataReadAdapter;
}

describe("source-derived translation coverage", () => {
  it("uses bulk public source projections with identical segmentation instead of per-slug reads", async () => {
    const reads = adapter();
    const expected = await buildCoverageInventory(reads);
    reads.getPublicTranslationSubstanceDocuments = vi.fn(async () => [await reads.getPublicSubstanceBySlug("article")] as never);
    reads.getPublicEffectArticles = vi.fn(async () => [await reads.getPublicEffectBySlug("effect")] as never);
    const articleSlugs = vi.mocked(reads.getPublicSubstanceSlugs);
    articleSlugs.mockClear();
    const actual = await buildCoverageInventory(reads);
    expect(actual.records).toEqual(expected.records);
    expect(articleSlugs).not.toHaveBeenCalled();
    expect(reads.getPublicTranslationSubstanceDocuments).toHaveBeenCalledTimes(1);
    expect(reads.getPublicEffectArticles).toHaveBeenCalledTimes(1);
  });
  it("counts never-stored source units in every public corpus even when all existing jobs completed", async () => {
    const report = await getTranslationCoverage(adapter(), context);
    expect(report.byKind.map(({ kind }) => kind)).toEqual(["article", "effect", "report", "library", "replication", "profile"]);
    expect(report.byKind.every((counts) => counts.records === 1 && counts.missing > 0)).toBe(true);
    expect(report.summary.records).toBe(6);
    expect(report.summary.missing).toBe(report.summary.units);
    expect(report.summary.current).toBe(0);
    expect(report.queue.completed).toBe(99);
    expect(report.publication.status).toBe("unverified");
    expect(report.pages.map(({ href }) => href)).toContain("/contributors/profile");
    expect(report.pages.some(({ slug }) => slug.startsWith("excluded"))).toBe(false);
  });

  it("deduplicates concurrent source traversals and keeps new store evidence fresh", async () => {
    const reads = adapter();
    const [first, second] = await Promise.all([getCoverageInventory(reads), getCoverageInventory(reads)]);
    expect(first).toBe(second);
    expect(await getCoverageInventory(reads)).toBe(first);
    expect(reads.getPublicSubstanceSlugs).toHaveBeenCalledTimes(1);
    const inventory = await buildCoverageInventory(adapter());
    expect(inventory.records.find(({ kind }) => kind === "profile")?.units.some(({ source }) => source.includes("Canonical Name"))).toBe(false);
  });

  it("resolves bounded history source links without inventing pages for retired hashes", async () => {
    const reads = adapter();
    const inventory = await getCoverageInventory(reads);
    const hash = inventory.records.find(({ kind }) => kind === "profile")!.units[0].hash;
    const usages = await getTranslationHashUsages(reads, [hash, "retired"]);
    expect(usages[hash]).toMatchObject({ total: 1, pages: [{ label: "PROFILE", href: "/contributors/profile", kind: "profile" }] });
    expect(usages.retired).toEqual({ total: 0, pages: [] });
    await expect(getTranslationHashUsages(reads, Array.from({ length: 201 }, (_, i) => String(i)))).rejects.toThrow("200");
  });

  it("keeps rejection, missing, stale and current exclusive and glossary QA contextual", () => {
    const report = summarizeTranslationCoverage({
      inventory: { generatedAt: 1, records: [{ kind: "article", slug: "x", units: [
        { hash: "a", source: "Light" }, { hash: "b", source: "Missing" }, { hash: "c", source: "Old" }, { hash: "d", source: "Rejected" },
      ] }, { kind: "report", slug: "y", units: [{ hash: "a", source: "Light" }] }] },
      context: { ...context, glossary: { Light: "轻度" }, kinds: { Light: "enum:dose" } },
      stored: new Map([
        ["a", { hash: "a", target: "浅色", prompt_version: "now" }],
        ["c", { hash: "c", target: "旧", prompt_version: "old" }],
        ["d", { hash: "d", target: "旧", prompt_version: "old" }],
      ]),
      rejections: new Map([["d", { hash: "d", locale: "zh-Hans", source: "Rejected", defects: ["NUMBER"], attempts: 1, last_tried_at: 1 }]]),
      queue: { queued: 2, running: 1, failed: 1, completed: 20, retrying: 1 },
    });
    expect(report.uniqueHashes).toBe(4);
    expect(report.summary).toEqual({ records: 2, units: 5, current: 2, missing: 1, stale: 1, rejected: 1, glossaryMisses: 1, repeatedPunctuation: 0, leftoverLatin: 0 });
    expect(report.affectedPagesTotal).toBe(1);
    expect(report.byKind.find(({ kind }) => kind === "report")?.glossaryMisses).toBe(0);
  });

  it("counts stored doubled punctuation and leftover English, keeping substance names and Latin glossary renderings", () => {
    const report = summarizeTranslationCoverage({
      inventory: { generatedAt: 1, records: [
        { kind: "article", slug: "ibogaine", units: [{ hash: "a", source: "Ibogaine is an alkaloid." }] },
        { kind: "report", slug: "trip", units: [
          { hash: "b", source: "The phenidates, esters, are known." },
          { hash: "c", source: "Many users combine ibogaine with scalines." },
        ] },
      ] },
      context: { ...context, glossary: { Phenidate: "哌醋甲酯类", "3,5-Dimethoxyphenethylamine (scalines)": "3,5-二甲氧基苯乙胺（scaline类）" } },
      stored: new Map([
        ["a", { hash: "a", target: "ibogaine 是一种生物碱。", prompt_version: "now" }],
        ["b", { hash: "b", target: "酯类，，phenidates，，最知名。", prompt_version: "now" }],
        ["c", { hash: "c", target: "许多使用者将 ibogaine 与 scalines 合用。", prompt_version: "now" }],
      ]),
      rejections: new Map(),
      queue: { queued: 0, running: 0, failed: 0, completed: 0, retrying: 0 },
    });
    expect(report.summary).toMatchObject({ current: 3, repeatedPunctuation: 1, leftoverLatin: 1 });
    expect(report.pages.map(({ slug }) => slug)).toEqual(["trip"]);
  });
});
