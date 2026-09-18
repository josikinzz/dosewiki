import { describe, expect, it } from "vitest";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { buildGlossaryUsageIndex, queryGlossaryUsage } from "./glossaryUsage";

const reads = {
  getPublicSubstanceDocuments: async () => [{
    slug: "dmt", title: "DMT", summary: "A replicator studies replications. Tracers are not traceroute. Tracers recur.",
    dosage: { routes: [{ route: "smoked", dose_ranges: { threshold: { min: 2, max: 5 } } }] },
    duration: { routes: [{ route: "smoked", stages: { onset: { min: 1, max: 2 } } }] },
    subjective_effects: { progressive_stages: { "1. Taking Off": { note: "A rapid transition.", effects: [] } } },
    editorial_review: { notes: "editor-only-secret" },
    references: [{ title: "bibliography-only-secret", metadataProvenance: "private-source-secret" }],
    section_gaps: { notes: "gap-only-secret" },
  }],
  getPublicEffectArticles: async () => [{
    slug: "tracers", name: "Tracers", tags: ["visual"], summary: "Visual trails.",
    description_raw: "Visible afterimages.", style_variations_raw: "Trails can vary.",
    editorial_notes: "effect-editor-secret",
  }],
  getPublishedEffectIndexArticles: async () => [
    { slug: "public-guide", title: "Public guide", publication_status: "published", body_raw: "A guide to tracers.", authors: ["private-author-secret"] },
    // Fail closed even if a future adapter accidentally broadens its result.
    { slug: "private-guide", title: "Private guide", publication_status: "draft", body_raw: "draft-only-secret" },
    { slug: "blog", title: "Blog", publication_status: "published", kind: "blog", body_raw: "blog-only-secret" },
  ],
} as unknown as PublicDataReadAdapter;
const index = buildGlossaryUsageIndex(reads);

async function usage(term: string) {
  return queryGlossaryUsage(await index, term);
}

describe("glossary source usage", () => {
  it("links numbered source headings with and without the presentation ordinal", async () => {
    const numbered = await usage("1. Taking Off");
    const plain = await usage("Taking Off");
    expect(plain.nodes).toEqual(numbered.nodes);
    expect(plain.nodes).toEqual([expect.objectContaining({ href: "/dmt#subjective-effects", context: "Subjective Effects > 1. Taking Off", kind: "label" })]);
  });

  it("links canonical category headings and actual structured fields", async () => {
    expect((await usage("Novel States")).nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: "/effects/category/novel-cognitive-states", context: "Effect category panel" }),
      expect.objectContaining({ href: "/effects", context: "Cognitive > Novel States" }),
    ]));
    expect((await usage("Threshold")).nodes).toContainEqual(expect.objectContaining({ href: "/dmt#dosage-duration", context: "Dosage > smoked > Threshold" }));
    expect((await usage("Style Variations")).nodes).toContainEqual(expect.objectContaining({ href: "/effects/tracers#style-variations" }));
  });

  it("uses actual filter URLs without folding distinct replication labels together", async () => {
    expect((await usage("Open-eye")).nodes).toEqual([expect.objectContaining({ href: "/replications?viewing=open-eye", context: "Viewing mode: Open-eye" })]);
    expect((await usage("Experiential replications")).nodes).toEqual([expect.objectContaining({ href: "/replications?family=experiential-replication" })]);
    const singular = await usage("Replicator");
    expect(singular.nodes.some((node) => node.context.includes("Approved replicator") || node.context.includes("Verified replicator"))).toBe(false);
    expect(singular.nodes.some((node) => node.href.includes("artistType=replicator"))).toBe(false);
    expect((await usage("Replicators")).nodes).toContainEqual(expect.objectContaining({ href: "/replications?artistType=replicator" }));
  });

  it("counts stable source nodes, not repeated words, and observes literal matching boundaries", async () => {
    const tracers = await usage("Tracers");
    expect(tracers.nodes.filter((node) => node.id === "substance:dmt:field:summary")).toHaveLength(1);
    expect(tracers.totalSourceNodes).toBe(tracers.nodes.length);
    expect((await usage("tracer")).nodes).toEqual([]);
    expect((await usage("[tracers]")).nodes).toEqual([]);
    expect(tracers.nodes).toContainEqual(expect.objectContaining({ href: "/articles/public-guide" }));
    expect(tracers.nodes.every((node) => !("text" in node))).toBe(true);
  });

  it("never indexes private metadata, draft library content, or excluded blog content", async () => {
    for (const term of ["editor-only-secret", "bibliography-only-secret", "private-source-secret", "gap-only-secret", "effect-editor-secret", "private-author-secret", "draft-only-secret", "blog-only-secret"]) {
      expect((await usage(term)).nodes, term).toEqual([]);
    }
  });

  it("paginates source identities in stable order without inflating the total", async () => {
    const many = await buildGlossaryUsageIndex({ ...reads, getPublicEffectArticles: async () => Array.from({ length: 45 }, (_, position) => ({
      slug: `sample-${position}`, name: `Sample ${position}`, tags: [], summary: "paginationneedle", description_raw: "",
    })) } as unknown as PublicDataReadAdapter);
    const first = queryGlossaryUsage(many, "paginationneedle");
    const second = queryGlossaryUsage(many, "paginationneedle", first.nextOffset!);
    expect(first.totalSourceNodes).toBe(45);
    expect(first.nodes).toHaveLength(40);
    expect(second.nodes).toHaveLength(5);
    expect(second.nextOffset).toBeNull();
    expect(new Set([...first.nodes, ...second.nodes].map((node) => node.id)).size).toBe(45);
  });
});
