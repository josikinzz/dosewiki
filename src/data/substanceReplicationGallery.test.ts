import { describe, expect, it } from "vitest";
import {
  directGalleryAssociationProvenance,
  includeDirectlyAssociatedRows,
  isShowcaseEligible,
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

  it("matches a title that names the substance, as the weakest signal", () => {
    const { matches } = matchSubstanceGalleryReplications(
      [row({ slug: "road", title: "2C-B Road" })],
      ["Visual drifting"],
      ["2C-B"],
    );
    expect(slugsOf(matches)).toEqual(["road"]);
    expect(matches[0].provenance).toEqual({ matchedVia: "title", effectSlug: "name-match" });
  });

  it("refuses a longer chemical name that merely contains the substance", () => {
    const { matches } = matchSubstanceGalleryReplications(
      [
        row({ slug: "fly", title: "2C-B-FLY Grid" }),
        row({ slug: "meo", title: "5-MeO-DMT Tunnel" }),
      ],
      [],
      ["2C-B", "DMT"],
    );
    expect(slugsOf(matches)).toEqual([]);
  });

  it("refuses a substance name buried inside an ordinary word", () => {
    const { matches } = matchSubstanceGalleryReplications(
      [row({ slug: "noise", title: "Random static" })],
      [],
      ["DOM"],
    );
    expect(slugsOf(matches)).toEqual([]);
  });

  it("reads titles case-insensitively and across punctuation", () => {
    const { matches } = matchSubstanceGalleryReplications(
      [
        row({ slug: "lower", title: "mdma sunrise" }),
        row({ slug: "dashed", title: "DMT — breakthrough" }),
      ],
      [],
      ["MDMA", "DMT"],
    );
    expect(slugsOf(matches)).toEqual(["lower", "dashed"]);
  });

  it("keeps effect provenance when the title also names the substance", () => {
    const { matches } = matchSubstanceGalleryReplications(
      [row({ slug: "drift-a", title: "2C-B drifting", effect_slug: "drifting" })],
      ["Visual drifting"],
      ["2C-B"],
    );
    expect(matches[0].provenance).toEqual({ matchedVia: "effect_slug", effectSlug: "drifting" });
  });

  it("ranks every effect match above every name match", () => {
    const { matches } = matchSubstanceGalleryReplications(
      [
        row({ slug: "named-video", type: "video", title: "2C-B reel" }),
        row({ slug: "effect-still", effect_slug: "drifting" }),
      ],
      ["Visual drifting"],
      ["2C-B"],
    );
    expect(slugsOf(matches)).toEqual(["effect-still", "named-video"]);
  });

  it("drops a row excluded everywhere from the candidate pool", () => {
    const { matches } = matchSubstanceGalleryReplications(
      [
        row({ slug: "junk", effect_slug: "drifting", showcase_excluded: true }),
        row({ slug: "keeper", effect_slug: "drifting" }),
      ],
      ["Visual drifting"],
    );
    expect(slugsOf(matches)).toEqual(["keeper"]);
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

describe("includeDirectlyAssociatedRows", () => {
  it("adds direct curation and exclusion once while preserving derived provenance", () => {
    const corpus = [
      row({ slug: "matched", effect_slug: "drifting" }),
      row({ slug: "direct-curated", effect_slug: "geometry" }),
      row({ slug: "direct-removed", effect_slug: "geometry" }),
      row({ slug: "unassociated", effect_slug: "geometry" }),
    ];
    const derived = matchSubstanceGalleryReplications(corpus, ["Visual drifting"]).matches;
    const available = includeDirectlyAssociatedRows(corpus, derived, {
      curated_slugs: ["direct-curated", "matched"],
      removed_slugs: ["direct-removed"],
    });
    expect(slugsOf(available)).toEqual(["matched", "direct-curated", "direct-removed"]);
    expect(available[0].provenance.matchedVia).toBe("effect_slug");
    expect(available.slice(1).map((match) => match.provenance)).toEqual([
      { matchedVia: "curated", effectSlug: "geometry" },
      { matchedVia: "curated", effectSlug: "geometry" },
    ]);
  });

  it("does not revive a retired direct association", () => {
    const retired = row({ slug: "retired", showcase_excluded: true });
    expect(
      directGalleryAssociationProvenance(retired, { removed_slugs: ["retired"] }),
    ).toBeNull();
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

  it("preserves direct associations while pruning deleted, retired, and ineligible rows", () => {
    const corpus = [
      row({ slug: "matched" }),
      row({ slug: "direct-curated" }),
      row({ slug: "direct-removed" }),
      row({ slug: "retired", showcase_excluded: true }),
      row({ slug: "figure", role: "figure" }),
      row({ slug: "audio", type: "audio" }),
    ];
    expect(
      normalizeGalleryCuration({
        curatedSlugs: ["direct-curated", "deleted"],
        removedSlugs: ["matched", "direct-removed", "retired", "figure", "audio"],
        matchableSlugs: new Set(["matched"]),
        curatableSlugs: new Set(
          corpus.filter(isShowcaseEligible).map((replication) => replication.slug),
        ),
      }),
    ).toEqual({
      curatedSlugs: ["direct-curated"],
      removedSlugs: ["matched", "direct-removed"],
      prunedCurated: ["deleted"],
      prunedRemoved: ["retired", "figure", "audio"],
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

describe("unmatched direct curation → exclusion → later save", () => {
  it("keeps the exclusion stored and visible as a direct association", () => {
    const corpus = [
      row({ slug: "matched", effect_slug: "drifting" }),
      row({ slug: "direct", effect_slug: "geometry" }),
      row({ slug: "retired", effect_slug: "geometry", showcase_excluded: true }),
    ];
    const { matches } = matchSubstanceGalleryReplications(corpus, ["Visual drifting"]);
    const matchableSlugs = new Set(matches.map((match) => match.row.slug));
    const curatableSlugs = new Set(
      corpus.filter(isShowcaseEligible).map((replication) => replication.slug),
    );

    const curated = normalizeGalleryCuration({
      curatedSlugs: ["direct"],
      removedSlugs: [],
      matchableSlugs,
      curatableSlugs,
    });
    expect(curated.curatedSlugs).toEqual(["direct"]);

    // `setReplicationExclusions` moves the direct placement between the two
    // non-overlapping stored lists.
    const excluded = normalizeGalleryCuration({
      curatedSlugs: curated.curatedSlugs.filter((slug) => slug !== "direct"),
      removedSlugs: [...curated.removedSlugs, "direct"],
      matchableSlugs,
      curatableSlugs,
    });
    expect(excluded).toMatchObject({
      curatedSlugs: [],
      removedSlugs: ["direct"],
      prunedRemoved: [],
    });

    // A later full gallery upsert normalizes against the same eligible corpus,
    // so the unmatched exclusion is not mistaken for a phantom derived match.
    const laterSave = normalizeGalleryCuration({
      curatedSlugs: ["matched"],
      removedSlugs: excluded.removedSlugs,
      matchableSlugs,
      curatableSlugs,
    });
    expect(laterSave.removedSlugs).toEqual(["direct"]);
    expect(
      directGalleryAssociationProvenance(corpus[1], {
        curated_slugs: laterSave.curatedSlugs,
        removed_slugs: laterSave.removedSlugs,
      }),
    ).toEqual({ matchedVia: "curated", effectSlug: "geometry" });
  });
});
