import { describe, expect, it } from "vitest";
import {
  canonicalTitleDrugRoute,
  directGalleryAssociationProvenance,
  includeDirectlyAssociatedRows,
  isCombinationReplication,
  isShowcaseEligible,
  matchSubstanceGalleryReplications,
  mergeCuratedGallery,
  normalizeGalleryCuration,
  substanceGalleryTargetOf,
  titleDrugRoutesOf,
  type SubstanceGalleryMatchableRow,
  type SubstanceGalleryTarget,
} from "./substanceReplicationGallery";

const row = (
  overrides: Partial<SubstanceGalleryMatchableRow> & { slug: string },
): SubstanceGalleryMatchableRow => ({
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

  it("orders specific videos, specific images, class videos, then class images", () => {
    const corpus = [
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
    ]);
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
