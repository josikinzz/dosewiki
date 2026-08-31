import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "../../schema";
import {
  buildItemListSchema,
  buildReplicationSchema,
  buildSubjectiveEffectSchema,
  buildSubstanceSchema,
  serializeJsonLd,
} from "./structuredData";
import { SITE_FLAVOR_CONFIGS } from "../../config/siteFlavor";

const baseArticle = {
  id: 1,
  title: "LSD",
  priority: "high",
  index_categories: ["psychedelic", "lysergamide", "psychedelic"],
  identification: {
    common_name: "LSD",
    alternative_names: ["Acid", "Lysergic acid diethylamide", "Acid"],
  },
  classification: {
    chemical_class: ["Lysergamide"],
    psychoactive_class: ["Psychedelic"],
  },
  summary: "LSD is a semisynthetic psychedelic used here as a structured-data fixture.",
  dosage: {},
  duration: {},
  subjective_effects: {},
  comparisons: [],
  pharmacology: {
    binding_sites: [{ target: "5-HT2A", tag: "5-HT2A receptor agonist" }],
  },
  interactions: {},
  reagent_testing: {},
  tolerance: {
    full_tolerance: "",
    half_tolerance: "",
    baseline_tolerance: "",
    cross_tolerance: [],
  },
  harm_potential: {},
  legality: {},
  references: [
    {
      id: "doi-fixture",
      type: "journal_article",
      title: "A fixture paper",
      authors: ["Ada Lovelace"],
      year: 2024,
      doi: "10.1234/example",
      url: "https://example.com/paper",
      access: "open",
      sourceType: "primary_literature",
      quality: "high",
      supportStatus: "inspected",
    },
  ],
  source_citations: [],
  citations: [],
} as unknown as SubstanceArticle;

describe("substance structured data", () => {
  it("builds answer-ready Article JSON-LD with a canonical URL, Drug entity, and citations", () => {
    const schema = buildSubstanceSchema(baseArticle, "https://dosewiki-admin.vercel.app/lsd");

    expect(schema["@id"]).toBe("https://dosewiki-admin.vercel.app/lsd#article");
    expect(schema.url).toBe("https://dosewiki-admin.vercel.app/lsd");
    expect(schema.mainEntityOfPage["@id"]).toBe("https://dosewiki-admin.vercel.app/lsd");
    expect(schema.author.url).toBe("https://dosewiki-admin.vercel.app");
    expect(schema.publisher.url).toBe("https://dosewiki-admin.vercel.app");
    expect(schema.about).toMatchObject({
      "@type": "Drug",
      name: "LSD",
      alternateName: ["Acid", "Lysergic acid diethylamide"],
      mechanismOfAction: "5-HT2A receptor agonist",
    });
    expect(schema.keywords).toEqual(["Psychedelic", "Lysergamide", "psychedelic", "lysergamide"]);
    expect(schema.citation?.[0]).toMatchObject({
      "@type": "CreativeWork",
      name: "A fixture paper",
      url: "https://example.com/paper",
      datePublished: "2024",
      identifier: ["doi:10.1234/example"],
      isAccessibleForFree: true,
    });
  });

  it("keeps raw MediaWiki reference markup out of citation JSON-LD", () => {
    const schema = buildSubstanceSchema(
      {
        ...baseArticle,
        references: [{
          ...baseArticle.references[0],
          title: '<ref name="pmid24648790" /> [[NMDA receptor]] {{abbrlink|PCP|phencyclidine}}',
          doi: "10.2147/SAR.S36761",
          url: "https://doi.org/10.2147/SAR.S36761",
        }],
      } as unknown as SubstanceArticle,
      "https://dose.wiki/dextromethorphan",
    );

    expect(schema.citation?.[0]?.name).toBe("DOI 10.2147/sar.s36761");
    expect(JSON.stringify(schema.citation)).not.toContain("<ref");
    expect(JSON.stringify(schema.citation)).not.toContain("[[");
  });

  it("strips inline citation tokens from every structured-data text field", () => {
    const schema = buildSubstanceSchema(
      {
        ...baseArticle,
        summary:
          "ETH-LAD is a lysergamide analog of LSD.[cite:doi-10-1002-dta-2196] It was first documented by Shulgin.[cite:pmid-8742795]",
        pharmacology: {
          binding_sites: [
            {
              target: "5-HT2A",
              tag: "5-HT2A receptor agonist[cite:doi-10-1002-dta-2196]",
            },
          ],
        },
      } as unknown as SubstanceArticle,
      "https://dose.wiki/eth-lad",
    );

    expect(schema.description).toBe(
      "ETH-LAD is a lysergamide analog of LSD. It was first documented by Shulgin.",
    );
    expect(schema.about.description).toBe(
      "ETH-LAD is a lysergamide analog of LSD. It was first documented by Shulgin.",
    );
    expect(schema.about).toMatchObject({
      mechanismOfAction: "5-HT2A receptor agonist",
    });
    // Nothing else in the payload may carry a token either — this ships to
    // crawlers on every article.
    expect(serializeJsonLd(schema)).not.toContain("[cite:");
  });

  it("serializes JSON-LD safely for script tag injection", () => {
    const schema = buildSubstanceSchema(
      {
        ...baseArticle,
        title: "</script><script>alert(1)</script>",
        identification: {
          ...baseArticle.identification,
          common_name: "</script><script>alert(1)</script>",
        },
      },
      "https://dose.wiki/script-test",
    );

    const json = serializeJsonLd(schema);

    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).name).toBe("</script><script>alert(1)</script>");
  });

  it("builds answer-ready Article JSON-LD for subjective effect pages", () => {
    const schema = buildSubjectiveEffectSchema(
      {
        slug: "drifting",
        name: "Drifting",
        summary: "Objects appear to warp and morph across themselves.",
        tags: ["visual", "distortion"],
        featured: false,
        description_raw: "A description.",
        citations: [
          {
            url: "https://example.com/effect-source",
            text: "A source about drifting.",
            from: "Effect Index",
          },
        ],
      },
      "https://dosewiki-admin.vercel.app/effects/drifting",
      SITE_FLAVOR_CONFIGS.dosewiki,
    );

    expect(schema).toMatchObject({
      "@id": "https://dosewiki-admin.vercel.app/effects/drifting#article",
      url: "https://dosewiki-admin.vercel.app/effects/drifting",
      about: {
        "@type": "DefinedTerm",
        name: "Drifting",
        inDefinedTermSet: {
          name: "dose.wiki Subjective Effect Index",
          url: "https://dosewiki-admin.vercel.app/effects",
        },
      },
      author: {
        url: "https://dosewiki-admin.vercel.app",
      },
      publisher: {
        url: "https://dosewiki-admin.vercel.app",
      },
      keywords: ["visual", "distortion"],
    });
    expect(schema.citation?.[0]).toMatchObject({
      "@type": "CreativeWork",
      name: "A source about drifting.",
      url: "https://example.com/effect-source",
      publisher: {
        "@type": "Organization",
        name: "Effect Index",
      },
    });
  });

  it("builds collection ItemList JSON-LD with canonical item positions", () => {
    const schema = buildItemListSchema({
      url: "https://dosewiki-admin.vercel.app/substances",
      name: "dose.wiki Substance Index",
      description: "Browse indexed substance records.",
      items: [
        { name: "LSD", url: "https://dosewiki-admin.vercel.app/lsd" },
        { name: "MDMA", url: "https://dosewiki-admin.vercel.app/mdma" },
      ],
    });

    expect(schema).toMatchObject({
      "@type": "ItemList",
      "@id": "https://dosewiki-admin.vercel.app/substances#item-list",
      numberOfItems: 2,
      mainEntityOfPage: {
        "@id": "https://dosewiki-admin.vercel.app/substances",
      },
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "LSD",
          url: "https://dosewiki-admin.vercel.app/lsd",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "MDMA",
          url: "https://dosewiki-admin.vercel.app/mdma",
        },
      ],
    });
    expect(JSON.parse(serializeJsonLd(schema)).numberOfItems).toBe(2);
  });
});

describe("structured data under the Effect Index flavor", () => {
  it("names the Effect Index publisher and author organisation on substance schemas", () => {
    const schema = buildSubstanceSchema(
      baseArticle as SubstanceArticle,
      "https://effectindex.com/lsd",
      SITE_FLAVOR_CONFIGS.effectindex,
    );

    expect(schema.author).toEqual({
      "@type": "Organization",
      name: "Effect Index Contributors",
      url: "https://effectindex.com",
    });
    expect(schema.publisher).toEqual({
      "@type": "Organization",
      name: "Effect Index",
      url: "https://effectindex.com",
    });
  });

  it("names the Effect Index term set and organisations on subjective effect schemas", () => {
    const schema = buildSubjectiveEffectSchema(
      {
        slug: "drifting",
        name: "Drifting",
        summary: "Objects appear to warp and morph across themselves.",
        tags: ["visual"],
        featured: false,
        description_raw: "A description.",
        citations: [],
      },
      "https://effectindex.com/effects/drifting",
      SITE_FLAVOR_CONFIGS.effectindex,
    );

    expect(schema).toMatchObject({
      "@id": "https://effectindex.com/effects/drifting#article",
      url: "https://effectindex.com/effects/drifting",
      about: {
        inDefinedTermSet: {
          name: "Subjective Effect Index",
          url: "https://effectindex.com/effects",
        },
      },
      author: { name: "Effect Index Contributors", url: "https://effectindex.com" },
      publisher: { name: "Effect Index", url: "https://effectindex.com" },
    });
  });

  it("falls back to each flavor's own origin when no page URL is supplied", () => {
    expect(
      buildSubstanceSchema(baseArticle as SubstanceArticle, undefined, SITE_FLAVOR_CONFIGS.dosewiki).url,
    ).toBe("https://dose.wiki");
    expect(
      buildSubstanceSchema(baseArticle as SubstanceArticle, undefined, SITE_FLAVOR_CONFIGS.effectindex).url,
    ).toBe("https://effectindex.com");
    expect(buildSubjectiveEffectSchema(
      {
        slug: "drifting",
        name: "Drifting",
        summary: undefined,
        tags: [],
        featured: false,
        description_raw: "",
        citations: [],
      },
      undefined,
      SITE_FLAVOR_CONFIGS.effectindex,
    )).toMatchObject({
      url: "https://effectindex.com/effects",
      description: "Drifting subjective effect entry in Effect Index.",
    });
  });
});

describe("replication structured data", () => {
  const input = {
    slug: "tree-bark-chelsea-morgan",
    title: "Tree Bark",
    type: "image" as const,
    contentUrl: "https://assets.test/tree-bark.jpg",
  };
  const url = "https://dosewiki-admin.vercel.app/replications/tree-bark-chelsea-morgan";

  it("names a known creator as a Person", () => {
    const schema = buildReplicationSchema({ ...input, artist: "Chelsea Morgan" }, url);
    expect(schema.creator).toEqual({ "@type": "Person", name: "Chelsea Morgan", url: undefined });
    expect(schema.copyrightNotice).toBe("Chelsea Morgan");
  });

  it("asserts no creator for the folded unattributed markers", () => {
    // "Unknown" and "Anonymous" mark the absence of a creator (T-1); the
    // JSON-LD must not publish a Person the page itself refuses to name.
    for (const artist of ["Unknown", "Anonymous"]) {
      const schema = buildReplicationSchema({ ...input, artist }, url);
      expect(schema.creator).toBeUndefined();
      expect(schema.copyrightNotice).toBeUndefined();
    }
  });
});
