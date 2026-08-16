import { describe, expect, it } from "vitest";
import {
  matchSubstanceGalleryReplications,
  mergeCuratedGallery,
  normalizeGalleryCuration,
  resolveVisualEffectSlugs,
  visualEffectNamesOf,
  type SubstanceGalleryMatchableRow,
} from "./substanceReplicationGallery";

const row = (
  overrides: Partial<SubstanceGalleryMatchableRow> & { slug: string },
): SubstanceGalleryMatchableRow => ({
  type: "image",
  ...overrides,
});

const slugsOf = <Row extends SubstanceGalleryMatchableRow>(
  matches: readonly { row: Row }[],
) => matches.map((match) => match.row.slug);

describe("visualEffectNamesOf", () => {
  it("collects names across visual subcategories in document order, deduplicated", () => {
    const names = visualEffectNamesOf({
      sensory: {
        visual: {
          subcategories: {
            Enhancements: {
              note: "",
              effects: [
                { name: "Colour enhancement", description: "" },
                { name: "Acuity enhancement", description: "" },
              ],
            },
            Distortions: {
              note: "",
              effects: [
                { name: "Drifting", description: "" },
                // Same vocabulary entry as the one under Enhancements.
                { name: "Colour Enhancement", description: "" },
              ],
            },
          },
        },
      },
    });

    expect(names).toEqual(["Colour enhancement", "Acuity enhancement", "Drifting"]);
  });

  it("yields no names rather than an error for documents without the path", () => {
    expect(visualEffectNamesOf(null)).toEqual([]);
    expect(visualEffectNamesOf(undefined)).toEqual([]);
    expect(visualEffectNamesOf({})).toEqual([]);
    expect(visualEffectNamesOf({ sensory: { visual: {} } })).toEqual([]);
    expect(visualEffectNamesOf("not a document")).toEqual([]);
  });

  it("drops junk entries individually instead of failing the document", () => {
    const names = visualEffectNamesOf({
      sensory: {
        visual: {
          subcategories: {
            Enhancements: {
              effects: [{ name: "Drifting" }, { title: "no name" }, null, { name: 7 }],
            },
            Broken: { effects: "not an array" },
          },
        },
      },
    });

    expect(names).toEqual(["Drifting"]);
  });
});

describe("resolveVisualEffectSlugs", () => {
  it("derives an unaliased name exactly like the article chips do", () => {
    // publicHref.effectFromName parity: slugify(name), no alias hop.
    const { slugs, unlinkableNames } = resolveVisualEffectSlugs(["Geometry", "Tracers"]);
    expect(slugs).toEqual(["geometry", "tracers"]);
    expect(unlinkableNames).toEqual([]);
  });

  it("follows alias hops the way the chips resolve them", () => {
    const { slugs } = resolveVisualEffectSlugs([
      "Color enhancement", // spelling alias
      "Visual drifting", // renamed effect
      "Acuity enhancement", // prefixed rename
    ]);
    expect(slugs).toEqual(["colour-enhancement", "drifting", "visual-acuity-enhancement"]);
  });

  it("declares deliberately unlinked names unlinkable", () => {
    const { slugs, unlinkableNames } = resolveVisualEffectSlugs(["Environmental orbism"]);
    expect(slugs).toEqual([]);
    expect(unlinkableNames).toEqual(["Environmental orbism"]);
  });

  it("treats umbrella terms that chip to a category index as unlinkable", () => {
    // "Hallucinations" under sensory.visual names a family, not one effect —
    // there is no effect slug for a replication to carry.
    const { slugs, unlinkableNames } = resolveVisualEffectSlugs(["Hallucinations"]);
    expect(slugs).toEqual([]);
    expect(unlinkableNames).toEqual(["Hallucinations"]);
  });

  it("deduplicates two names that resolve to the same effect", () => {
    const { slugs, slugByName } = resolveVisualEffectSlugs([
      "Color enhancement",
      "Colour enhancement",
    ]);
    expect(slugs).toEqual(["colour-enhancement"]);
    expect(slugByName.get("Color enhancement")).toBe("colour-enhancement");
    expect(slugByName.get("Colour enhancement")).toBe("colour-enhancement");
  });
});

describe("matchSubstanceGalleryReplications", () => {
  const corpus = [
    row({ slug: "drift-a", effect_slug: "drifting" }),
    row({ slug: "geometry-a", effect_slug: "geometry", effect_tags: ["drifting"] }),
    row({ slug: "tracer-a", effect_slug: "tracers", effect_tags: ["colour-enhancement"] }),
    row({ slug: "figure-a", effect_slug: "drifting", role: "figure" }),
    row({ slug: "audio-a", effect_slug: "drifting", type: "audio" }),
    row({ slug: "unrelated", effect_slug: "auditory-distortion" }),
  ];

  it("matches by owning effect slug with provenance", () => {
    const { matches } = matchSubstanceGalleryReplications(corpus, ["Visual drifting"]);
    expect(slugsOf(matches)).toEqual(["drift-a", "geometry-a"]);
    expect(matches[0].provenance).toEqual({ matchedVia: "effect_slug", effectSlug: "drifting" });
  });

  it("matches through effect tags with the tag slug as provenance", () => {
    const { matches } = matchSubstanceGalleryReplications(corpus, ["Visual drifting"]);
    expect(matches[1].provenance).toEqual({ matchedVia: "effect_tags", effectSlug: "drifting" });
  });

  it("prefers the owning slug over a tag when both match", () => {
    const { matches } = matchSubstanceGalleryReplications(corpus, ["Geometry", "Visual drifting"]);
    const geometry = matches.find((match) => match.row.slug === "geometry-a");
    expect(geometry?.provenance).toEqual({ matchedVia: "effect_slug", effectSlug: "geometry" });
  });

  it("resolves alias hops identically to the article chips", () => {
    const { matches } = matchSubstanceGalleryReplications(corpus, ["Color enhancement"]);
    expect(slugsOf(matches)).toEqual(["tracer-a"]);
    expect(matches[0].provenance).toEqual({
      matchedVia: "effect_tags",
      effectSlug: "colour-enhancement",
    });
  });

  it("never publishes figures or audio", () => {
    const { matches } = matchSubstanceGalleryReplications(corpus, ["Visual drifting"]);
    expect(slugsOf(matches)).not.toContain("figure-a");
    expect(slugsOf(matches)).not.toContain("audio-a");
  });

  it("keeps the corpus order within each media kind as the default order", () => {
    const { matches } = matchSubstanceGalleryReplications(corpus, [
      "Tracers",
      "Visual drifting",
    ]);
    expect(slugsOf(matches)).toEqual(["drift-a", "geometry-a", "tracer-a"]);
  });

  it("bumps videos ahead of images in the pre-curation default order", () => {
    const mixed = [
      row({ slug: "still-a", effect_slug: "drifting" }),
      row({ slug: "motion-a", effect_slug: "drifting", type: "video" }),
      row({ slug: "still-b", effect_slug: "drifting" }),
      row({ slug: "motion-b", effect_slug: "drifting", type: "video" }),
    ];
    const { matches } = matchSubstanceGalleryReplications(mixed, ["Visual drifting"]);
    expect(slugsOf(matches)).toEqual(["motion-a", "motion-b", "still-a", "still-b"]);
  });

  it("keeps a curated slug's stored order regardless of the videos-first default", () => {
    const mixed = [
      row({ slug: "still-a", effect_slug: "drifting" }),
      row({ slug: "motion-a", effect_slug: "drifting", type: "video" }),
    ];
    const { matches } = matchSubstanceGalleryReplications(mixed, ["Visual drifting"]);
    const merged = mergeCuratedGallery(
      matches,
      { curated_slugs: ["still-a", "motion-a"] },
      (match) => match.row.slug,
    );
    expect(slugsOf(merged)).toEqual(["still-a", "motion-a"]);
  });

  it("reports names that put nothing in the showcase", () => {
    const { matches, unmatchedEffectNames } = matchSubstanceGalleryReplications(corpus, [
      "Visual drifting", // owned match
      "Environmental orbism", // unlinkable
      "Hallucinations", // umbrella term
      "Symmetrical texture repetition", // resolvable, but no corpus row
    ]);
    expect(slugsOf(matches)).toEqual(["drift-a", "geometry-a"]);
    expect(unmatchedEffectNames).toEqual([
      "Environmental orbism",
      "Hallucinations",
      "Symmetrical texture repetition",
    ]);
  });

  it("counts a name represented only by a tag on an owned row as matched", () => {
    // drift-tag is visible via geometry-a's tag even though no row is owned by
    // drifting here; teaching it as unmatched would tell the editor to tag
    // what is already tagged.
    const { unmatchedEffectNames } = matchSubstanceGalleryReplications(
      [row({ slug: "geometry-a", effect_slug: "geometry", effect_tags: ["drifting"] })],
      ["Geometry", "Visual drifting"],
    );
    expect(unmatchedEffectNames).toEqual([]);
  });

  it("returns an empty result for a substance with no visual effects", () => {
    expect(matchSubstanceGalleryReplications(corpus, [])).toEqual({
      matches: [],
      unmatchedEffectNames: [],
    });
  });
});

describe("mergeCuratedGallery", () => {
  const items = [
    { slug: "a" },
    { slug: "b" },
    { slug: "c" },
    { slug: "d" },
  ];
  const slugOf = (item: { slug: string }) => item.slug;

  it("publishes only the curated slugs, in their stored order", () => {
    const merged = mergeCuratedGallery(
      items,
      { curated_slugs: ["c", "a"], removed_slugs: [] },
      slugOf,
    );
    expect(merged.map(slugOf)).toEqual(["c", "a"]);
  });

  it("publishes nothing without a curation row", () => {
    // The gate: an unreviewed substance shows no showcase at all, however many
    // works its visual effects happen to match.
    expect(mergeCuratedGallery(items, null, slugOf)).toEqual([]);
    expect(mergeCuratedGallery(items, undefined, slugOf)).toEqual([]);
  });

  it("publishes nothing for a curation row with an empty curated list", () => {
    expect(mergeCuratedGallery(items, { curated_slugs: [], removed_slugs: ["b"] }, slugOf)).toEqual(
      [],
    );
    expect(mergeCuratedGallery(items, {}, slugOf)).toEqual([]);
  });

  it("never publishes an excluded slug, even when it is also curated", () => {
    // The invariant behind the deliriant exclusions: a deliberate suppression
    // outranks a stray promotion at read time, not just at write time.
    const merged = mergeCuratedGallery(
      items,
      { curated_slugs: ["a", "b", "c"], removed_slugs: ["b"] },
      slugOf,
    );
    expect(merged.map(slugOf)).toEqual(["a", "c"]);
  });

  it("skips curated slugs that no longer match anything", () => {
    const merged = mergeCuratedGallery(
      items,
      { curated_slugs: ["gone", "b", "phantom", "a"], removed_slugs: ["also-gone"] },
      slugOf,
    );
    expect(merged.map(slugOf)).toEqual(["b", "a"]);
  });

  it("places a duplicated curated slug once, at its first mention", () => {
    const merged = mergeCuratedGallery(
      items,
      { curated_slugs: ["c", "a", "c"], removed_slugs: [] },
      slugOf,
    );
    expect(merged.map(slugOf)).toEqual(["c", "a"]);
  });
});

describe("normalizeGalleryCuration", () => {
  const matchableSlugs = new Set(["a", "b", "c"]);

  it("prunes slugs that no longer match and echoes what it dropped", () => {
    expect(
      normalizeGalleryCuration({
        curatedSlugs: ["c", "gone", "a"],
        removedSlugs: ["b", "deleted"],
        matchableSlugs,
      }),
    ).toEqual({
      curatedSlugs: ["c", "a"],
      removedSlugs: ["b"],
      prunedCurated: ["gone"],
      prunedRemoved: ["deleted"],
    });
  });

  it("rejects a slug that is both curated and removed", () => {
    expect(() =>
      normalizeGalleryCuration({
        curatedSlugs: ["a", "b"],
        removedSlugs: ["b"],
        matchableSlugs,
      }),
    ).toThrow(/both curated and removed: b/);
  });

  it("trims and deduplicates before judging", () => {
    expect(
      normalizeGalleryCuration({
        curatedSlugs: [" a ", "a", "", "b"],
        removedSlugs: ["c", "c"],
        matchableSlugs,
      }),
    ).toEqual({
      curatedSlugs: ["a", "b"],
      removedSlugs: ["c"],
      prunedCurated: [],
      prunedRemoved: [],
    });
  });
});

describe("matched → saved → read round trip", () => {
  it("reproduces the upsert-then-read contract: curated slugs only, in stored order", () => {
    const corpus = [
      row({ slug: "one", effect_slug: "drifting" }),
      row({ slug: "two", effect_slug: "drifting" }),
      row({ slug: "three", effect_slug: "geometry" }),
      row({ slug: "four", effect_slug: "geometry" }),
    ];
    const names = ["Visual drifting", "Geometry"];

    // Write path: prune the editor's submission against the current matches.
    const { matches } = matchSubstanceGalleryReplications(corpus, names);
    const stored = normalizeGalleryCuration({
      curatedSlugs: ["four", "one", "renamed-away"],
      removedSlugs: ["two"],
      matchableSlugs: new Set(matches.map((match) => match.row.slug)),
    });
    expect(stored.prunedCurated).toEqual(["renamed-away"]);

    // Read path: apply the stored echo to a fresh match. "three" matched but
    // was never curated, so the article does not show it.
    const reread = matchSubstanceGalleryReplications(corpus, names);
    const merged = mergeCuratedGallery(
      reread.matches,
      { curated_slugs: stored.curatedSlugs, removed_slugs: stored.removedSlugs },
      (match) => match.row.slug,
    );
    expect(slugsOf(merged)).toEqual(["four", "one"]);
  });
});
