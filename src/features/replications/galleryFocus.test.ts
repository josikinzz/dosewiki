import { describe, expect, it } from "vitest";
import type { GalleryReplication } from "@/types/replications";
import { UNATTRIBUTED_KEY } from "@/features/effects/gallery/galleryArtistIdentity";
import { UNATTRIBUTED_LABEL } from "@/features/replications/replicationVocabulary";
import {
  artistPageHrefForWork,
  canonicalArtistPageRedirectKey,
  mapArtistPageKeysByProfile,
  resolveArtistPageProfileKey,
  resolveGalleryFocus,
} from "./galleryFocus";
import { getReplicationArtistRouteAlias } from "@server/next/publicRouteAliases";

let seq = 0;
function rep(overrides: Partial<GalleryReplication> = {}): GalleryReplication {
  seq += 1;
  return {
    _id: `id-${seq}`,
    _creationTime: seq,
    slug: `slug-${seq}`,
    title: `Work ${seq}`,
    artist: "Chelsea Morgan",
    type: "image",
    storage_id: `store-${seq}`,
    effect_slug: "geometry",
    format: "jpg",
    created_at: "2024-01-01T00:00:00.000Z",
    url: `https://cdn.test/${seq}.jpg`,
    ...overrides,
  };
}

const corpus = [
  rep({ artist: "Chelsea Morgan" }),
  rep({ artist: "chelsea morgan", effect_slug: "drifting" }),
  rep({ artist: "" }),
  rep({ artist: "unknown" }),
  rep({ artist: "Solo", url: undefined }),
];

const context = {
  effects: [
    { slug: "geometry", name: "Geometry" },
    { slug: "drifting", name: "Drifting" },
  ],
  contributorDirectory: [
    { key: "chelseamorgan", displayName: "Chelsea Morgan", aliases: [] },
  ],
};

describe("resolveGalleryFocus", () => {
  it("resolves a known artist key to their group, Artist Page link included", () => {
    const focus = resolveGalleryFocus(
      { kind: "artist", key: "chelsea-morgan" },
      corpus,
      context,
    );

    expect(focus?.label).toBe("Chelsea Morgan");
    expect(focus?.group.count).toBe(2);
    // The heading names the group's own page — one artist, one address.
    expect(focus?.group.href).toBe("/replications/artist/chelsea-morgan");
  });

  it("unions every source-era credit claimed by one profile at its canonical display-name route", () => {
    const josieDirectory = [
      {
        key: "JOSIE",
        displayName: "Josie Kins",
        aliases: ["josie", "josikinz", "josikins"],
      },
    ];
    const josieCorpus = [
      ...Array.from({ length: 10 }, () => rep({ artist: "Josie Kins" })),
      ...Array.from({ length: 2 }, () => rep({ artist: "Josie" })),
      ...Array.from({ length: 20 }, () => rep({ artist: "josikins" })),
      rep({
        artist: "Josikins",
        artist_url: "https://psychonautwiki.org/wiki/User:Josikins",
      }),
    ];
    const josieContext = {
      ...context,
      contributorDirectory: josieDirectory,
    };

    const canonical = resolveGalleryFocus(
      { kind: "artist", key: "josie-kins" },
      josieCorpus,
      josieContext,
    );
    const retiredHandle = resolveGalleryFocus(
      { kind: "artist", key: "josikins" },
      josieCorpus,
      josieContext,
    );
    const shortName = resolveGalleryFocus(
      { kind: "artist", key: "josie" },
      josieCorpus,
      josieContext,
    );

    for (const focus of [canonical, retiredHandle, shortName]) {
      expect(focus).toMatchObject({
        key: "josie-kins",
        label: "Josie Kins",
        group: {
          href: "/replications/artist/josie-kins",
          count: 33,
          imageCount: 33,
          videoCount: 0,
        },
      });
      expect(new Set(focus?.group.items.map((item) => item.artist))).toEqual(
        new Set(["Josie Kins", "Josie", "josikins", "Josikins"]),
      );
    }
  });

  it("resolves the unattributed bucket at the stable `unknown` key", () => {
    const focus = resolveGalleryFocus(
      { kind: "artist", key: "unknown" },
      corpus,
      context,
    );

    expect(focus?.label).toBe(UNATTRIBUTED_LABEL);
    // The empty credit and the literal "unknown" marker fold together.
    expect(focus?.group.count).toBe(2);
    expect(focus?.group.href).toBeUndefined();
  });

  it("folds Anonymous-credited works into the unattributed bucket, retiring their old key", () => {
    const withAnon = [...corpus, rep({ artist: "Anonymous" })];

    // No group answers to the marker's old key any more…
    expect(
      resolveGalleryFocus(
        { kind: "artist", key: "anonymous" },
        withAnon,
        context,
      ),
    ).toBeNull();
    // …its works count into the bucket instead.
    const focus = resolveGalleryFocus(
      { kind: "artist", key: "unknown" },
      withAnon,
      context,
    );
    expect(focus?.label).toBe(UNATTRIBUTED_LABEL);
    expect(focus?.group.count).toBe(3);
  });

  it("resolves an effect slug to its group, article link included", () => {
    const focus = resolveGalleryFocus(
      { kind: "effect", key: "drifting" },
      corpus,
      context,
    );

    expect(focus?.label).toBe("Drifting");
    expect(focus?.group.count).toBe(1);
    expect(focus?.group.href).toBe("/effects/drifting");
  });

  it("keeps a replication-only effect group but omits its nonexistent article link", () => {
    const orphanCorpus = [...corpus, rep({ effect_slug: "orphan-effect" })];
    const focus = resolveGalleryFocus(
      { kind: "effect", key: "orphan-effect" },
      orphanCorpus,
      context,
    );

    expect(focus?.label).toBe("orphan effect");
    expect(focus?.group.href).toBeUndefined();
  });

  it("returns null for a bogus key, in either kind", () => {
    expect(
      resolveGalleryFocus(
        { kind: "artist", key: "nobody-here" },
        corpus,
        context,
      ),
    ).toBeNull();
    expect(
      resolveGalleryFocus(
        { kind: "effect", key: "not-an-effect" },
        corpus,
        context,
      ),
    ).toBeNull();
  });

  it("does not resolve a key whose only works are undisplayable", () => {
    // "Solo" exists in the corpus but carries no resolved asset, so the
    // gallery never shows the group and the URL space must not include it.
    expect(
      resolveGalleryFocus({ kind: "artist", key: "solo" }, corpus, context),
    ).toBeNull();
  });

  it("does not resolve an artist whose only works artist views withhold", () => {
    // Withholding removes the group, so the key never enters the URL space:
    // /replications/artist/giger resolves to null and the route 404s, rather
    // than throwing or rendering an empty page. The same work still answers
    // on the effect side, which is the whole point of the asymmetry.
    const withCreature = [
      ...corpus,
      rep({ artist: "Giger", effect_slug: "unspeakable-horrors" }),
    ];
    const withEffect = {
      ...context,
      effects: [
        ...context.effects,
        { slug: "unspeakable-horrors", name: "Unspeakable horrors" },
      ],
    };

    expect(
      resolveGalleryFocus(
        { kind: "artist", key: "giger" },
        withCreature,
        withEffect,
      ),
    ).toBeNull();
    expect(
      resolveGalleryFocus(
        { kind: "effect", key: "unspeakable-horrors" },
        withCreature,
        withEffect,
      )?.group.count,
    ).toBe(1);
  });

  it("makes the profile identity canonical while preserving and combining source-era credits", () => {
    const renamedCorpus = [
      rep({ artist: "Wooodfield" }),
      rep({ artist: "Wooodfield" }),
      rep({ artist: "Phosform" }),
    ];
    const renamedContext = {
      ...context,
      contributorDirectory: [
        { key: "PHOSFORM", displayName: "Phosform", aliases: ["wooodfield"] },
      ],
    };

    const canonical = resolveGalleryFocus(
      { kind: "artist", key: "phosform" },
      renamedCorpus,
      renamedContext,
    );
    const legacy = resolveGalleryFocus(
      { kind: "artist", key: "wooodfield" },
      renamedCorpus,
      renamedContext,
    );

    expect(canonical).toMatchObject({
      key: "phosform",
      label: "Phosform",
      group: { key: "phosform", label: "Phosform", count: 3 },
    });
    expect(legacy).toMatchObject({
      key: "phosform",
      label: "Phosform",
      group: { key: "phosform", label: "Phosform", count: 3 },
    });
    expect(legacy?.group.items.map((item) => item.artist)).toEqual([
      "Wooodfield",
      "Wooodfield",
      "Phosform",
    ]);
    expect(canonicalArtistPageRedirectKey("wooodfield", legacy!)).toBe(
      "phosform",
    );
    expect(canonicalArtistPageRedirectKey("phosform", canonical!)).toBeNull();
  });
});

describe("resolveArtistPageProfileKey", () => {
  it("resolves the profile that claims the credit line, for decoration", () => {
    const focus = resolveGalleryFocus(
      { kind: "artist", key: "chelsea-morgan" },
      corpus,
      context,
    );
    if (!focus) throw new Error("expected a resolved focus");

    expect(
      resolveArtistPageProfileKey(focus.group, context.contributorDirectory),
    ).toBe("chelseamorgan");
  });

  it("resolves a claim made through an alias", () => {
    const directory = [
      { key: "CM", displayName: "C. M.", aliases: ["Chelsea Morgan"] },
    ];
    const focus = resolveGalleryFocus(
      { kind: "artist", key: "chelsea-morgan" },
      corpus,
      {
        ...context,
        contributorDirectory: directory,
      },
    );
    if (!focus) throw new Error("expected a resolved focus");

    expect(resolveArtistPageProfileKey(focus.group, directory)).toBe("CM");
  });

  it("leaves an unclaimed credit line undecorated", () => {
    const withLoner = [...corpus, rep({ artist: "Loner" })];
    const focus = resolveGalleryFocus(
      { kind: "artist", key: "loner" },
      withLoner,
      context,
    );
    if (!focus) throw new Error("expected a resolved focus");

    expect(
      resolveArtistPageProfileKey(focus.group, context.contributorDirectory),
    ).toBeNull();
  });

  it("never decorates the Unattributed bucket, even when a profile claims the label", () => {
    const focus = resolveGalleryFocus(
      { kind: "artist", key: "unknown" },
      corpus,
      context,
    );
    if (!focus) throw new Error("expected a resolved focus");
    expect(focus.group.key).toBe(UNATTRIBUTED_KEY);

    const grabby = [
      { key: "GRABBY", displayName: UNATTRIBUTED_LABEL, aliases: ["unknown"] },
    ];
    expect(resolveArtistPageProfileKey(focus.group, grabby)).toBeNull();
  });
});

describe("artistPageHrefForWork", () => {
  it("links a credited, displayable work to its Artist Page", () => {
    expect(artistPageHrefForWork(rep({ artist: "Chelsea Morgan" }))).toBe(
      "/replications/artist/chelsea-morgan",
    );
  });

  it("never links an unattributed credit", () => {
    expect(artistPageHrefForWork(rep({ artist: "" }))).toBeNull();
    expect(artistPageHrefForWork(rep({ artist: "unknown" }))).toBeNull();
    expect(artistPageHrefForWork(rep({ artist: "Anonymous" }))).toBeNull();
  });

  it("never links a work withheld from artist views", () => {
    // Giger's page may not exist at all (withholding removes groups), so the
    // byline must not name it; callers fall back to a claimed profile.
    expect(
      artistPageHrefForWork(
        rep({ artist: "Giger", effect_slug: "unspeakable-horrors" }),
      ),
    ).toBeNull();
  });
});

describe("mapArtistPageKeysByProfile", () => {
  const directory = [
    { key: "chelseamorgan", displayName: "Chelsea Morgan", aliases: [] },
    { key: "LYREA", displayName: "Lyrea", aliases: [] },
  ];

  it("forwards a profile that claims a displayable credit line", () => {
    const map = mapArtistPageKeysByProfile(corpus, directory);

    expect(map.get("CHELSEAMORGAN")).toBe("chelsea-morgan");
  });

  it("leaves a profile with no credited works alone", () => {
    // Lyrea reviews articles; she is not an artist surface and keeps her page.
    expect(mapArtistPageKeysByProfile(corpus, directory).has("LYREA")).toBe(
      false,
    );
  });

  it("ignores undisplayable and withheld works when deciding", () => {
    const withGiger = [
      ...corpus,
      rep({ artist: "Giger", effect_slug: "unspeakable-horrors" }),
      rep({ artist: "Solo", url: undefined }),
    ];
    const claimingDirectory = [
      ...directory,
      { key: "GIGER", displayName: "Giger", aliases: [] },
      { key: "SOLO", displayName: "Solo", aliases: [] },
    ];
    const map = mapArtistPageKeysByProfile(withGiger, claimingDirectory);

    // Neither has an Artist Page, so neither profile may forward to a 404.
    expect(map.has("GIGER")).toBe(false);
    expect(map.has("SOLO")).toBe(false);
  });

  it("never maps the Unattributed bucket to anybody", () => {
    const grabby = [
      { key: "GRABBY", displayName: "Unknown", aliases: ["anonymous"] },
    ];
    expect(mapArtistPageKeysByProfile(corpus, grabby).size).toBe(0);
  });

  it("sends a profile claiming two credit lines to its canonical display-name page", () => {
    const twoNames = [
      rep({ artist: "Kaylee" }),
      rep({ artist: "Kaytwo" }),
      rep({ artist: "Kaytwo" }),
    ];
    const kaylee = [
      { key: "KAYLEE", displayName: "Kaylee", aliases: ["Kaytwo"] },
    ];

    expect(mapArtistPageKeysByProfile(twoNames, kaylee).get("KAYLEE")).toBe(
      "kaylee",
    );
  });
});

describe("getReplicationArtistRouteAlias", () => {
  it("forwards the retired Anonymous key to the unattributed segment", () => {
    expect(getReplicationArtistRouteAlias("anonymous")).toBe("unknown");
    expect(getReplicationArtistRouteAlias(" ANONYMOUS ")).toBe("unknown");
  });

  it("forwards the retired StingrayZ handle to the Symmetric Vision page", () => {
    // Every StingrayZ credit was rewritten to "Symmetric Vision" on 2026-09-02,
    // so no group produces this key and the address needs a static forward.
    expect(getReplicationArtistRouteAlias("stingrayz")).toBe("symmetric-vision");
    expect(getReplicationArtistRouteAlias("StingrayZ")).toBe("symmetric-vision");
  });

  it("forwards the handles folded into Loka, Phosform, and Stas Constantine", () => {
    // Same 2026-09-02 rewrite: these keys slugify differently from the name
    // the works now carry, unlike oracle-emissary or cold-wasabi, which map
    // onto their proper-name keys unchanged.
    expect(getReplicationArtistRouteAlias("lokavision")).toBe("loka");
    expect(getReplicationArtistRouteAlias("wheressuede")).toBe("loka");
    expect(getReplicationArtistRouteAlias("wooodfield")).toBe("phosform");
    expect(getReplicationArtistRouteAlias("stasconstantine")).toBe("stas-constantine");
    expect(getReplicationArtistRouteAlias("cold-wasabi")).toBeNull();
  });

  it("knows nothing about live or bogus keys", () => {
    expect(getReplicationArtistRouteAlias("chelsea-morgan")).toBeNull();
    expect(getReplicationArtistRouteAlias("unknown")).toBeNull();
  });
});
