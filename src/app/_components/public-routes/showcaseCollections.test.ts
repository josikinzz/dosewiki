import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplicationWithUrl } from "@/types/replications";
import { getEffectShowcaseWorks, getSubstanceShowcaseWorks } from "./showcaseCollections";

const reads = vi.hoisted(() => ({
  getPublicEffectBySlug: vi.fn(),
  getPublicEffects: vi.fn(),
  getPublicReplicationsByEffect: vi.fn(),
  getPublicSubstanceBySlug: vi.fn(),
  getPublicReplicationsForSubstance: vi.fn(),
  getPublicContributorProfiles: vi.fn(),
}));
vi.mock("@server/data/publicData", () => reads);
const translations = vi.hoisted(() => ({
  getLocalizedPublicEffects: vi.fn(),
  getLocalizedPublicEffectBySlug: vi.fn(),
}));
vi.mock("@server/translation/localizedRecords", () => translations);
const recordTranslations = vi.hoisted(() => ({
  localizeRecords: vi.fn(async (records: readonly ReplicationWithUrl[]) => ({
    records: records.map((record) => ({ ...record, title: `中文：${record.title}` })),
    applied: records.length,
    missing: 0,
  })),
}));
vi.mock("@server/translation/liveTranslation", () => recordTranslations);

const taggedWork: ReplicationWithUrl = {
  _id: "tagged-work",
  _creationTime: 0,
  slug: "walk",
  title: "Walk",
  artist: "Artist",
  type: "video",
  format: "mp4",
  created_at: "2026-09-07",
  url: "https://media.example/walk.mp4",
  effect_slug: "drifting",
  effect_tags: ["aesthetic-distillation"],
};

describe("effect showcase collection eligibility", () => {
  beforeEach(() => {
    reads.getPublicEffectBySlug.mockReset().mockResolvedValue(null);
    reads.getPublicEffects.mockReset().mockResolvedValue([]);
    reads.getPublicReplicationsByEffect.mockReset().mockResolvedValue([]);
    reads.getPublicSubstanceBySlug.mockReset().mockResolvedValue(null);
    reads.getPublicReplicationsForSubstance.mockReset().mockResolvedValue({ items: [] });
    reads.getPublicContributorProfiles.mockReset().mockResolvedValue([]);
    translations.getLocalizedPublicEffects.mockReset().mockResolvedValue([]);
    translations.getLocalizedPublicEffectBySlug.mockReset().mockResolvedValue(null);
    recordTranslations.localizeRecords.mockClear();
  });

  it("plays an explicitly tagged collection before its editorial article exists", async () => {
    reads.getPublicReplicationsByEffect.mockResolvedValue([taggedWork]);
    const collection = await getEffectShowcaseWorks("aesthetic-distillation");
    expect(collection?.works.map((work) => ({ slug: work.slug, effectSlug: work.effectSlug }))).toEqual([
      { slug: "walk", effectSlug: "aesthetic-distillation" },
    ]);
  });

  it("distinguishes unknown collections from an existing article with no media", async () => {
    expect(await getEffectShowcaseWorks("unknown-effect")).toBeNull();
    reads.getPublicEffectBySlug.mockResolvedValue({ name: "Known effect" });
    expect(await getEffectShowcaseWorks("known-effect")).toEqual({ works: [], effectName: "Known effect" });
  });

  it("gives article, viewer and embed loaders the same complete editorial sequence", async () => {
    const rows = Array.from({ length: 300 }, (_, index) => ({
      ...taggedWork, slug: `work-${index}`,
      type: index % 2 ? "image" as const : "video" as const,
      viewing_mode: index % 2 ? "closed-eye" as const : "open-eye" as const,
    }));
    const order = rows.map(row => row.slug).reverse();
    reads.getPublicSubstanceBySlug.mockResolvedValue({ slug: "lsd", title: "LSD" });
    reads.getPublicReplicationsForSubstance.mockResolvedValue({
      items: rows.map(replication => ({ replication, provenance: { matchedVia: "specific_drug", effectSlug: "drifting" } })),
      carouselOrder: order,
    });
    reads.getPublicEffectBySlug.mockResolvedValue({ slug: "drifting", name: "Drifting", gallery_order: order });
    reads.getPublicReplicationsByEffect.mockResolvedValue(rows);
    expect((await getSubstanceShowcaseWorks("lsd"))?.works.map(work => work.slug)).toEqual(order);
    expect((await getEffectShowcaseWorks("drifting"))?.works.map(work => work.slug)).toEqual(order);
  });

  it("joins mirror effect names by canonical slug rather than English chip text", async () => {
    reads.getPublicSubstanceBySlug.mockResolvedValue({
      slug: "lsd",
      title: "LSD",
      subjective_effects: { sensory: { visual: { subcategories: { distortions: { effects: [{ name: "Drifting" }] } } } } },
    });
    reads.getPublicEffects.mockResolvedValue([
      { slug: "drifting", name: "Visual drifting" },
      { slug: "environmental-patterning", name: "Environmental patterning" },
    ]);
    const item = (effectSlug: string) => ({
      replication: { ...taggedWork, slug: `work-${effectSlug}` },
      provenance: { matchedVia: "specific_drug", effectSlug },
    });
    reads.getPublicReplicationsForSubstance.mockResolvedValue({
      items: [item("drifting"), item("environmental-patterning"), item("no-such-effect")],
    });
    reads.getPublicEffectBySlug.mockResolvedValue({ slug: "drifting", name: "Drifting" });
    reads.getPublicReplicationsByEffect.mockResolvedValue([taggedWork]);
    translations.getLocalizedPublicEffects.mockResolvedValue([
      { slug: "drifting", name: "视觉漂移" },
      { slug: "environmental-patterning", name: "环境图案化" },
    ]);
    translations.getLocalizedPublicEffectBySlug.mockResolvedValue({ slug: "drifting", name: "视觉漂移" });

    expect((await getSubstanceShowcaseWorks("lsd"))?.works.map((work) => work.effectName)).toEqual([
      "Drifting",
      "Environmental patterning",
      "no such effect",
    ]);
    expect((await getSubstanceShowcaseWorks("lsd", "zh-Hans"))?.works.map((work) => work.effectName)).toEqual([
      "视觉漂移",
      "环境图案化",
      "no such effect",
    ]);
    const effect = await getEffectShowcaseWorks("drifting", "zh-Hans");
    expect(effect?.effectName).toBe("视觉漂移");
    expect(effect?.works.map((work) => work.effectName)).toEqual(["视觉漂移"]);
    expect((await getEffectShowcaseWorks("drifting"))?.effectName).toBe("Drifting");
  });

});
