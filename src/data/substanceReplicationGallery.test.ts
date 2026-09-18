import { describe, expect, it } from "vitest";
import {
  canonicalTitleDrugRoute,
  countSubstanceGalleryMatches,
  directGalleryAssociationProvenance,
  includeDirectlyAssociatedRows,
  isCombinationReplication,
  isShowcaseEligible,
  matchSubstanceGalleryReplications,
  mergeCuratedGallery,
  normalizeGalleryCarouselOrder,
  normalizeGalleryCuration,
  substanceGalleryMatchDigest,
  substanceGalleryTargetOf,
  titleDrugRoutesOf,
  type SubstanceGalleryMatchableRow,
  type SubstanceGalleryTarget,
} from "./substanceReplicationGallery";

const row = (
  overrides: Partial<SubstanceGalleryMatchableRow> & { slug: string },
): SubstanceGalleryMatchableRow => ({
  title: overrides.slug,
  type: "image",
  title_drugs: [],
  title_class_mentions: [],
  ...overrides,
});

const target = (
  slug: string,
  psychoactiveClasses: readonly string[] = [],
): SubstanceGalleryTarget => ({ slug, psychoactiveClasses });

const drug = (
  slug: string,
  drugClass: "psychedelics" | "dissociatives" | "deliriants" | "other",
) => ({
  slug,
  name: slug,
  class: drugClass,
  matched_title_text: slug,
});

const classMention = (
  drugClass: "psychedelics" | "dissociatives" | "deliriants" | "other",
) => ({
  class: drugClass,
  matched_title_text: drugClass,
});

const slugsOf = <Row extends SubstanceGalleryMatchableRow>(
  matches: readonly { row: Row }[],
) => matches.map((match) => match.row.slug);

describe("substanceGalleryTargetOf", () => {
  it("reads route and psychoactive classes from an article", () => {
    expect(
      substanceGalleryTargetOf({
        slug: "ketamine",
        classification: { psychoactive_class: ["Dissociative", "Hallucinogen"] },
      }),
    ).toEqual({
      slug: "ketamine",
      psychoactiveClasses: ["Dissociative", "Hallucinogen"],
    });
  });

  it("fails closed for a malformed article", () => {
    expect(substanceGalleryTargetOf(null)).toBeNull();
    expect(substanceGalleryTargetOf({ title: "No route" })).toBeNull();
  });
});

describe("title drug identity", () => {
  it("maps taxonomy aliases onto canonical article routes", () => {
    expect(canonicalTitleDrugRoute("dxm")).toBe("dextromethorphan");
    expect(canonicalTitleDrugRoute("nitrous-oxide")).toBe("nitrous");
    expect(canonicalTitleDrugRoute("metocin")).toBe("4-ho-met");
    expect(canonicalTitleDrugRoute("ketamine")).toBe("ketamine");
  });

  it("routes reviewed dissociative aliases even when stored taxonomy is stale", () => {
    expect(titleDrugRoutesOf(row({ slug: "dxm", title: "DXM tunnel" }))).toEqual([
      "dextromethorphan",
    ]);
    expect(titleDrugRoutesOf(row({ slug: "ketamine", title: "The K-Hole" }))).toEqual([
      "ketamine",
    ]);
    expect(
      titleDrugRoutesOf(row({ slug: "three-meo", title: "3-MeO-PCP replication" })),
    ).toEqual(["3-meo-pcp"]);
    expect(titleDrugRoutesOf(row({ slug: "unrelated", title: "Kitty dream" }))).toEqual([]);
  });

  it("uses reviewed aliases to detect combinations in stale taxonomy", () => {
    const combination = row({
      slug: "ketamine-dxm",
      title: "Ketamine + DXM replication",
    });
    expect(titleDrugRoutesOf(combination)).toEqual([
      "ketamine",
      "dextromethorphan",
    ]);
    expect(isCombinationReplication(combination)).toBe(true);
  });

  it("deduplicates repeated names for the same substance", () => {
    const dmt = row({
      slug: "dmt",
      title_drugs: [
        drug("dmt", "psychedelics"),
        { ...drug("dmt", "psychedelics"), matched_title_text: "dimethyltryptamine" },
      ],
    });
    expect(titleDrugRoutesOf(dmt)).toEqual(["dmt"]);
    expect(isCombinationReplication(dmt)).toBe(false);
  });

  it("treats multiple canonical routes as a combination", () => {
    const counterflip = row({
      slug: "counterflip",
      title_drugs: [
        drug("dxm", "dissociatives"),
        drug("diphenhydramine", "deliriants"),
      ],
    });
    expect(titleDrugRoutesOf(counterflip)).toEqual([
      "dextromethorphan",
      "diphenhydramine",
    ]);
    expect(isCombinationReplication(counterflip)).toBe(true);
  });

  it("recognizes the reviewed LSDXM portmanteau even before taxonomy repair", () => {
    const compact = row({
      slug: "lsdxm",
      title: "LSDXM Replication (Song: How much is weed)",
      title_drugs: [drug("cannabis", "other")],
    });
    expect(isCombinationReplication(compact)).toBe(true);
    expect(isShowcaseEligible(compact)).toBe(false);
  });

  it("treats a class-only cross-class work as a combination", () => {
    expect(
      isCombinationReplication(
        row({
          slug: "mixed-classes",
          title_class_mentions: [
            classMention("dissociatives"),
            classMention("deliriants"),
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe("matchSubstanceGalleryReplications", () => {
  it("places a standalone drug only on its canonical article", () => {
    const corpus = [
      row({
        slug: "dxm-work",
        type: "video",
        title_drugs: [drug("dxm", "dissociatives")],
        effect_slug: "visual-disconnection",
      }),
    ];

    const dextromethorphan = matchSubstanceGalleryReplications(
      corpus,
      target("dextromethorphan", ["Dissociative"]),
    );
    const ketamine = matchSubstanceGalleryReplications(
      corpus,
      target("ketamine", ["Dissociative"]),
    );

    expect(slugsOf(dextromethorphan.matches)).toEqual(["dxm-work"]);
    expect(dextromethorphan.matches[0].provenance).toEqual({
      matchedVia: "specific_drug",
      effectSlug: "visual-disconnection",
      substanceSlug: "dextromethorphan",
    });
    expect(ketamine.matches).toEqual([]);
  });

  it("adds every eligible Visual Disconnection still to dissociatives as a final fallback", () => {
    const visualStill = row({
      slug: "dxm-visual-still",
      title_drugs: [drug("dxm", "dissociatives")],
      effect_slug: "visual-disconnection",
    });
    const dextromethorphan = matchSubstanceGalleryReplications(
      [visualStill],
      target("dextromethorphan", ["Dissociative"]),
    ).matches;
    const ketamine = matchSubstanceGalleryReplications(
      [visualStill],
      target("ketamine", ["Dissociative"]),
    ).matches;

    expect(dextromethorphan[0].provenance.matchedVia).toBe("specific_drug");
    expect(ketamine[0].provenance).toEqual({
      matchedVia: "visual_disconnection",
      effectSlug: "visual-disconnection",
      drugClass: "dissociatives",
    });
    expect(
      matchSubstanceGalleryReplications(
        [visualStill],
        target("datura", ["Deliriant"]),
      ).matches,
    ).toEqual([]);
    expect(
      matchSubstanceGalleryReplications(
        [visualStill],
        target("lsd", ["Psychedelic"]),
      ).matches,
    ).toEqual([]);
  });

  it("does not use Visual Disconnection videos or combinations as fallback", () => {
    const video = row({
      slug: "visual-video",
      type: "video",
      effect_slug: "visual-disconnection",
    });
    const combination = row({
      slug: "visual-combination",
      effect_slug: "visual-disconnection",
      title_drugs: [
        drug("dxm", "dissociatives"),
        drug("diphenhydramine", "deliriants"),
      ],
    });
    expect(
      matchSubstanceGalleryReplications(
        [video, combination],
        target("ketamine", ["Dissociative"]),
      ).matches,
    ).toEqual([]);
  });

  it("spreads a general dissociative across dissociative articles only", () => {
    const corpus = [
      row({
        slug: "general-dissociative",
        title_class_mentions: [classMention("dissociatives")],
      }),
    ];

    expect(
      slugsOf(
        matchSubstanceGalleryReplications(
          corpus,
          target("ketamine", ["Dissociative"]),
        ).matches,
      ),
    ).toEqual(["general-dissociative"]);
    expect(
      matchSubstanceGalleryReplications(
        corpus,
        target("lsd", ["Psychedelic"]),
      ).matches,
    ).toEqual([]);
  });

  it("spreads a general deliriant across deliriant articles only", () => {
    const corpus = [
      row({
        slug: "general-deliriant",
        title_class_mentions: [classMention("deliriants")],
      }),
    ];
    const matches = matchSubstanceGalleryReplications(
      corpus,
      target("datura", ["Deliriant", "Hallucinogen"]),
    ).matches;
    expect(matches[0].provenance).toEqual({
      matchedVia: "drug_class",
      effectSlug: "deliriants",
      drugClass: "deliriants",
    });
  });

  it("never spreads general psychedelic work", () => {
    const corpus = [
      row({
        slug: "general-psychedelic",
        title_class_mentions: [classMention("psychedelics")],
      }),
    ];
    expect(
      matchSubstanceGalleryReplications(
        corpus,
        target("lsd", ["Psychedelic"]),
      ).matches,
    ).toEqual([]);
  });

  it("lets one specific drug outrank a broad class mention", () => {
    const corpus = [
      row({
        slug: "ambien",
        title_drugs: [drug("zolpidem", "other")],
        title_class_mentions: [classMention("deliriants")],
      }),
    ];
    expect(
      slugsOf(
        matchSubstanceGalleryReplications(corpus, target("zolpidem")).matches,
      ),
    ).toEqual(["ambien"]);
    expect(
      matchSubstanceGalleryReplications(
        corpus,
        target("datura", ["Deliriant"]),
      ).matches,
    ).toEqual([]);
  });

  it("excludes combinations from every single-substance article", () => {
    const corpus = [
      row({
        slug: "counterflip",
        title_drugs: [
          drug("dxm", "dissociatives"),
          drug("diphenhydramine", "deliriants"),
        ],
      }),
      row({
        slug: "mixed-classes",
        title_class_mentions: [
          classMention("dissociatives"),
          classMention("deliriants"),
        ],
      }),
    ];
    expect(
      matchSubstanceGalleryReplications(
        corpus,
        target("dextromethorphan", ["Dissociative"]),
      ).matches,
    ).toEqual([]);
    expect(
      matchSubstanceGalleryReplications(
        corpus,
        target("datura", ["Deliriant"]),
      ).matches,
    ).toEqual([]);
  });

  it("drops corpus-wide exclusions, figures, and audio", () => {
    const specific = [drug("ketamine", "dissociatives")];
    const corpus = [
      row({ slug: "retired", title_drugs: specific, showcase_excluded: true }),
      row({ slug: "figure", title_drugs: specific, role: "figure" }),
      row({ slug: "audio", title_drugs: specific, type: "audio" }),
    ];
    expect(
      matchSubstanceGalleryReplications(
        corpus,
        target("ketamine", ["Dissociative"]),
      ).matches,
    ).toEqual([]);
  });

  it("orders specific, class-general, then Visual Disconnection fallback media", () => {
    const corpus = [
      row({
        slug: "visual-fallback",
        effect_slug: "visual-disconnection",
      }),
      row({
        slug: "class-image",
        title_class_mentions: [classMention("dissociatives")],
      }),
      row({
        slug: "specific-image",
        title_drugs: [drug("ketamine", "dissociatives")],
      }),
      row({
        slug: "class-video",
        type: "video",
        title_class_mentions: [classMention("dissociatives")],
      }),
      row({
        slug: "specific-video",
        type: "video",
        title_drugs: [drug("ketamine", "dissociatives")],
      }),
    ];
    const { matches } = matchSubstanceGalleryReplications(
      corpus,
      target("ketamine", ["Dissociative"]),
    );
    expect(slugsOf(matches)).toEqual([
      "specific-video",
      "specific-image",
      "class-video",
      "class-image",
      "visual-fallback",
    ]);
  });
});

describe("substanceGalleryMatchDigest", () => {
  const corpus = [
    row({ slug: "dxm-video", type: "video", title_drugs: [drug("dxm", "dissociatives")] }),
    row({ slug: "dxm-vd-still", title_drugs: [drug("dxm", "dissociatives")], effect_slug: "visual-disconnection" }),
    row({ slug: "ket-still", title_drugs: [drug("ketamine", "dissociatives")] }),
    row({ slug: "general-disso", title_class_mentions: [classMention("dissociatives")] }),
    row({ slug: "general-deliriant", type: "video", title_class_mentions: [classMention("deliriants")] }),
    row({ slug: "general-psy", title_class_mentions: [classMention("psychedelics")] }),
    row({ slug: "vd-only", effect_slug: "visual-disconnection" }),
    row({ slug: "vd-video", type: "video", effect_slug: "visual-disconnection" }),
    row({ slug: "combo", title_drugs: [drug("dxm", "dissociatives"), drug("lsd", "psychedelics")] }),
    row({ slug: "excluded", title_drugs: [drug("ketamine", "dissociatives")], showcase_excluded: true }),
    row({ slug: "lsd-still", title_drugs: [drug("lsd", "psychedelics")] }),
  ];
  const targets = [
    target("dextromethorphan", ["Dissociative"]),
    target("ketamine", ["Dissociative"]),
    target("datura", ["Deliriant"]),
    target("lsd", ["Psychedelic"]),
    target("pcp", ["Dissociative", "Stimulant"]),
    target("nothing", []),
  ];

  it("counts exactly what the full matcher places, for every target shape", () => {
    const digest = substanceGalleryMatchDigest(corpus);
    for (const candidate of targets) {
      expect(countSubstanceGalleryMatches(digest, candidate)).toBe(
        matchSubstanceGalleryReplications(corpus, candidate).matches.length,
      );
    }
    expect(countSubstanceGalleryMatches(digest, target("dextromethorphan", ["Dissociative"]))).toBe(4);
  });

  it("collapses rows sharing policy inputs into one bucket and drops ineligible rows", () => {
    const digest = substanceGalleryMatchDigest(corpus);
    expect(digest.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(9);
    expect(digest.find((bucket) => bucket.route === "dextromethorphan" && !bucket.visualDisconnection))
      .toMatchObject({ count: 1 });
  });
});

describe("mergeCuratedGallery", () => {
  const corpus = [
    row({
      slug: "specific-old",
      type: "video",
      title_drugs: [drug("dmt", "psychedelics")],
    }),
    row({
      slug: "specific-new",
      type: "video",
      title_drugs: [drug("dmt", "psychedelics")],
    }),
    row({
      slug: "specific-image",
      title_drugs: [drug("dmt", "psychedelics")],
    }),
    row({ slug: "manual-tail" }),
  ];

  it("publishes automatic rows without a curation record", () => {
    const automatic = matchSubstanceGalleryReplications(corpus, target("dmt")).matches;
    expect(slugsOf(mergeCuratedGallery(automatic, null))).toEqual([
      "specific-old",
      "specific-new",
      "specific-image",
    ]);
  });

  it("uses stored order within a tier and appends newly tagged rows", () => {
    const automatic = matchSubstanceGalleryReplications(corpus, target("dmt")).matches;
    const available = includeDirectlyAssociatedRows(corpus, automatic, {
      curated_slugs: ["specific-old", "manual-tail"],
      removed_slugs: [],
    });
    expect(
      slugsOf(
        mergeCuratedGallery(available, {
          curated_slugs: ["specific-old", "manual-tail"],
          removed_slugs: [],
        }),
      ),
    ).toEqual([
      "specific-old",
      "specific-new",
      "specific-image",
      "manual-tail",
    ]);
  });

  it("uses carousel_order as the exact prefix across automatic tiers", () => {
    const visualFallback = row({
      slug: "visual-fallback",
      effect_slug: "visual-disconnection",
    });
    const automatic = matchSubstanceGalleryReplications(
      [...corpus, visualFallback],
      target("dextromethorphan", ["Dissociative"]),
    ).matches;
    const curation = {
      curated_slugs: ["manual-tail"],
      removed_slugs: [],
      carousel_order: ["visual-fallback", "manual-tail"],
    };
    const available = includeDirectlyAssociatedRows(
      [...corpus, visualFallback],
      automatic,
      curation,
    );
    expect(slugsOf(mergeCuratedGallery(available, curation))).toEqual([
      "visual-fallback",
      "manual-tail",
    ]);
  });

  it("keeps the visual fallback behind unmatched manual associations", () => {
    const visualFallback = row({
      slug: "visual-fallback",
      effect_slug: "visual-disconnection",
    });
    const automatic = matchSubstanceGalleryReplications(
      [...corpus, visualFallback],
      target("dextromethorphan", ["Dissociative"]),
    ).matches;
    const curation = {
      curated_slugs: ["manual-tail"],
      removed_slugs: [],
    };
    const available = includeDirectlyAssociatedRows(
      [...corpus, visualFallback],
      automatic,
      curation,
    );
    expect(slugsOf(mergeCuratedGallery(available, curation))).toEqual([
      "manual-tail",
      "visual-fallback",
    ]);
  });

  it("lets exclusions outrank automatic and manual placement", () => {
    const automatic = matchSubstanceGalleryReplications(corpus, target("dmt")).matches;
    const curation = {
      curated_slugs: ["specific-old", "manual-tail"],
      removed_slugs: ["specific-old", "manual-tail"],
    };
    const available = includeDirectlyAssociatedRows(corpus, automatic, curation);
    expect(slugsOf(mergeCuratedGallery(available, curation))).toEqual([
      "specific-new",
      "specific-image",
    ]);
  });
});

describe("normalizeGalleryCarouselOrder", () => {
  it("deduplicates and prunes slugs outside the visible collection", () => {
    expect(
      normalizeGalleryCarouselOrder(
        [" b ", "missing", "a", "b"],
        new Set(["a", "b"]),
      ),
    ).toEqual({ order: ["b", "a"], pruned: ["missing"] });
  });
});

describe("direct associations", () => {
  it("preserves unmatched manual curation and exclusion", () => {
    const manual = row({ slug: "manual", effect_slug: "geometry" });
    const removed = row({ slug: "removed", effect_slug: "drifting" });
    const curation = {
      curated_slugs: ["manual"],
      removed_slugs: ["removed"],
    };
    expect(directGalleryAssociationProvenance(manual, curation)).toEqual({
      matchedVia: "curated",
      effectSlug: "geometry",
    });
    expect(
      slugsOf(includeDirectlyAssociatedRows([manual, removed], [], curation)),
    ).toEqual(["manual", "removed"]);
  });

  it("does not revive a retired or combination direct association", () => {
    const retired = row({ slug: "retired", showcase_excluded: true });
    const combination = row({
      slug: "combination",
      title_drugs: [
        drug("lsd", "psychedelics"),
        drug("diphenhydramine", "deliriants"),
      ],
    });
    expect(
      directGalleryAssociationProvenance(retired, {
        curated_slugs: ["retired"],
      }),
    ).toBeNull();
    expect(
      directGalleryAssociationProvenance(combination, {
        curated_slugs: ["combination"],
      }),
    ).toBeNull();
  });
});

describe("normalizeGalleryCuration", () => {
  const matchableSlugs = new Set(["a", "b", "c"]);

  it("prunes missing slugs and echoes what it dropped", () => {
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

  it("preserves direct eligible associations and prunes ineligible rows", () => {
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
