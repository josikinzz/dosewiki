import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectReplicationsByArtistNames } from "../../convex/replications";
import { contributorMatchNames } from "../contributorProfileIdentity";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const mocks = vi.hoisted(() => ({
  queryConvex: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryConvex: mocks.queryConvex,
}));

const contributor = (
  overrides: { key: string; displayName: string; aliases?: string[] },
): NormalizedUserProfile => ({
  aliases: [],
  avatarUrl: null,
  bio: "",
  links: [],
  hasCustomBio: false,
  ...overrides,
});

const row = (artist: string) => ({ slug: artist.toLowerCase(), artist });

describe("replication contributor matching", () => {
  const rows = [
    row("Josie Kins"),
    row("josie kins"),
    row("Unity"),
    row("Someone Else"),
    row("Unknown"),
    row("various artists"),
    row("midjourney"),
  ];

  it("matches a contributor across an exact-cased display name and a lowercase alias", () => {
    const profile = contributor({
      key: "JOSIE",
      displayName: "Josie Kins",
      aliases: ["unity"],
    });

    expect(
      selectReplicationsByArtistNames(rows, contributorMatchNames(profile)).map((item) => item.artist),
    ).toEqual(["Josie Kins", "josie kins", "Unity"]);
  });

  it("never joins the unattributed marker, which names nobody a profile could be", () => {
    expect(selectReplicationsByArtistNames(rows, ["Unknown"])).toEqual([]);
    expect(selectReplicationsByArtistNames(rows, ["  UNKNOWN  "])).toEqual([]);
    expect(
      selectReplicationsByArtistNames(
        rows,
        contributorMatchNames(contributor({ key: "IMPOSTOR", displayName: "Unknown" })),
      ),
    ).toEqual([]);
  });

  it("joins a collective or generator credit to the marker profile that names it", () => {
    // "various artists" and "midjourney" are real, repeatable bylines, and the
    // site gives them marker profiles so their gallery sections are curatable.
    // The join is what makes that ordering reachable from the Contributors tab.
    const markers = contributor({
      key: "VARIOUS-ARTISTS",
      displayName: "Various Artists",
      aliases: ["midjourney"],
    });

    expect(
      selectReplicationsByArtistNames(rows, contributorMatchNames(markers)).map((item) => item.artist),
    ).toEqual(["various artists", "midjourney"]);
  });

  it("keeps a marker in the name list from dragging in unrelated works", () => {
    expect(
      selectReplicationsByArtistNames(rows, ["unknown", "Unity"]).map((item) => item.artist),
    ).toEqual(["Unity"]);
  });

  it("returns nothing rather than everything when a contributor has no usable names", () => {
    expect(selectReplicationsByArtistNames(rows, [])).toEqual([]);
    expect(selectReplicationsByArtistNames(rows, ["", "   "])).toEqual([]);
  });
});

describe("getReplicationsByContributor", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
  });

  it("asks Convex for the contributor's own works by normalized match name", async () => {
    mocks.queryConvex.mockResolvedValueOnce([
      { slug: "drifting", artist: "Josie Kins", type: "video", url: "https://x/1" },
    ]);

    const { getReplicationsByContributor } = await import("./publicData.replications");
    const replications = await getReplicationsByContributor(
      contributor({ key: "JOSIE", displayName: "Josie Kins", aliases: ["Josie", "josie kins"] }),
    );

    expect(mocks.queryConvex).toHaveBeenCalledTimes(1);
    expect(mocks.queryConvex).toHaveBeenCalledWith("replications:getByArtistNames", {
      artistNames: ["josie kins", "josie"],
    });
    expect(replications).toEqual([
      { slug: "drifting", artist: "Josie Kins", type: "video", url: "https://x/1" },
    ]);
  });

  it("leaves a figure out of a contributor's works rail", async () => {
    // The rail is headed "Replications" and prints its own count beside that
    // heading, and the permalink walks the same set — so a diagram credited to
    // this person would be presented as one of their works three times over.
    mocks.queryConvex.mockResolvedValueOnce([
      { slug: "drifting", artist: "Josie Kins", type: "video", url: "https://x/1" },
      { slug: "ecg-trace", artist: "Josie Kins", type: "image", role: "figure", url: "https://x/2" },
      { slug: "a-recording", artist: "Josie Kins", type: "audio", url: "https://x/3.mp3" },
    ]);

    const { getReplicationsByContributor } = await import("./publicData.replications");
    const works = await getReplicationsByContributor(
      contributor({ key: "JOSIE", displayName: "Josie Kins" }),
    );

    expect(works.map((work) => work.slug)).toEqual(["drifting"]);
  });

  it("returns an empty list for a contributor with no works", async () => {
    mocks.queryConvex.mockResolvedValueOnce([]);

    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "NOBODY", displayName: "Nobody" })),
    ).resolves.toEqual([]);
  });

  it("skips the read entirely when a profile carries no matchable name", async () => {
    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "BLANK", displayName: "" })),
    ).resolves.toEqual([]);
    expect(mocks.queryConvex).not.toHaveBeenCalled();
  });

  it("degrades to no works when the additive Convex query is not deployed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.queryConvex.mockRejectedValueOnce(
      new Error("[CONVEX Q(replications:getByArtistNames)] Could not find public function"),
    );

    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "JOSIE", displayName: "Josie Kins" })),
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("surfaces any other Convex failure instead of pretending the portfolio is empty", async () => {
    mocks.queryConvex.mockRejectedValueOnce(
      new Error("[CONVEX Q(replications:getByArtistNames)] Server Error"),
    );

    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "JOSIE", displayName: "Josie Kins" })),
    ).rejects.toThrow("Server Error");
  });
});

describe("getPublicReplicationsForSubstance", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
  });

  const item = (slug: string, overrides: Record<string, unknown> = {}) => ({
    replication: { slug, artist: "Josie Kins", type: "image", url: `https://x/${slug}`, ...overrides },
    provenance: { matchedVia: "effect_slug", effectSlug: "drifting" },
  });

  it("asks Convex for the substance's showcase and returns it ordered as served", async () => {
    mocks.queryConvex.mockResolvedValueOnce({
      items: [item("curated-head"), item("default-tail")],
      unmatchedEffectNames: ["Environmental orbism"],
    });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");
    const gallery = await getPublicReplicationsForSubstance("lsd");

    expect(mocks.queryConvex).toHaveBeenCalledTimes(1);
    expect(mocks.queryConvex).toHaveBeenCalledWith(
      "substanceGalleries:getPublicReplicationsForSubstance",
      { substance_slug: "lsd" },
    );
    expect(gallery.items.map((entry) => entry.replication.slug)).toEqual([
      "curated-head",
      "default-tail",
    ]);
    expect(gallery.unmatchedEffectNames).toEqual(["Environmental orbism"]);
  });

  it("re-applies the publishability gate at this layer like every list read", async () => {
    mocks.queryConvex.mockResolvedValueOnce({
      items: [item("a-work"), item("a-figure", { role: "figure" }), item("a-track", { type: "audio" })],
      unmatchedEffectNames: [],
    });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");
    const gallery = await getPublicReplicationsForSubstance("lsd");

    expect(gallery.items.map((entry) => entry.replication.slug)).toEqual(["a-work"]);
  });

  it("returns an empty gallery for a zero-match substance, not an error", async () => {
    mocks.queryConvex.mockResolvedValueOnce({ items: [], unmatchedEffectNames: [] });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");

    await expect(getPublicReplicationsForSubstance("aspirin")).resolves.toEqual({
      items: [],
      unmatchedEffectNames: [],
    });
  });

  it("degrades to an empty showcase when the additive Convex query is not deployed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.queryConvex.mockRejectedValueOnce(
      new Error(
        "[CONVEX Q(substanceGalleries:getPublicReplicationsForSubstance)] Could not find public function",
      ),
    );

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");

    await expect(getPublicReplicationsForSubstance("lsd")).resolves.toEqual({
      items: [],
      unmatchedEffectNames: [],
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("surfaces any other Convex failure instead of pretending the showcase is empty", async () => {
    mocks.queryConvex.mockRejectedValueOnce(
      new Error("[CONVEX Q(substanceGalleries:getPublicReplicationsForSubstance)] Server Error"),
    );

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");

    await expect(getPublicReplicationsForSubstance("lsd")).rejects.toThrow("Server Error");
  });
});

describe("getPublicGalleryReplications", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
  });

  const work = (slug: string, artist: string) => ({
    slug,
    artist,
    type: "image",
    url: `https://x/${slug}`,
  });

  const corpus = [
    work("drifting", "Josie Kins"),
    work("tracers", "josie"),
    work("breathing", "Kaytwo"),
    work("orbism", "A Stranger"),
  ];

  const stubConvex = (profiles: NormalizedUserProfile[]) => {
    mocks.queryConvex.mockImplementation(async (functionName: string) => {
      if (functionName === "replications:getPublicReplications") {
        return corpus;
      }
      if (functionName === "contributorProfiles:getAll") {
        return profiles;
      }
      if (functionName === "replicationTaxonomy:getPublicArtistsByKeys") {
        return [];
      }
      throw new Error(`Unexpected Convex read: ${functionName}`);
    });
  };

  it("drops an excluded artist's works across display name and alias credits", async () => {
    stubConvex([
      {
        ...contributor({ key: "JOSIE", displayName: "Josie Kins", aliases: ["josie"] }),
        exclude_from_gallery: true,
      },
      contributor({ key: "KAYTWO", displayName: "Kaytwo" }),
    ]);

    const { getPublicGalleryReplications } = await import("./publicData.replications");
    const gallery = await getPublicGalleryReplications();

    // Both of Josie's credit lines vanish; Kaytwo (not excluded) and the
    // profile-less "A Stranger" are untouched.
    expect(gallery.map((item) => item.slug)).toEqual(["breathing", "orbism"]);
  });

  it("passes the corpus through untouched when nobody is excluded", async () => {
    stubConvex([contributor({ key: "JOSIE", displayName: "Josie Kins", aliases: ["josie"] })]);

    const { getPublicGalleryReplications } = await import("./publicData.replications");

    await expect(getPublicGalleryReplications()).resolves.toEqual(corpus);
  });

  it("joins only slim artist taxonomy metadata into gallery previews", async () => {
    mocks.queryConvex.mockImplementation(async (functionName: string) => {
      if (functionName === "replications:getPublicReplications") return corpus;
      if (functionName === "contributorProfiles:getAll") return [];
      if (functionName === "replicationTaxonomy:getPublicArtistsByKeys") {
        return [
          {
            key: "josie kins",
            primary_type: "replicator",
            artist_type_tags: ["replicator"],
          },
        ];
      }
      throw new Error(`Unexpected Convex read: ${functionName}`);
    });

    const { getPublicGalleryReplications } = await import("./publicData.replications");
    const gallery = await getPublicGalleryReplications();

    expect(gallery.find((item) => item.artist === "Josie Kins")).toMatchObject({
      artist_primary_type: "replicator",
      artist_type_tags: ["replicator"],
    });
    expect(gallery.find((item) => item.artist === "A Stranger")?.artist_primary_type).toBeUndefined();
  });

  it("keeps the gallery buildable while the additive artist query is mid-deploy", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.queryConvex.mockImplementation(async (functionName: string) => {
      if (functionName === "replications:getPublicReplications") return corpus;
      if (functionName === "contributorProfiles:getAll") return [];
      if (functionName === "replicationTaxonomy:getPublicArtistsByKeys") {
        throw new Error("Server Error");
      }
      throw new Error(`Unexpected Convex read: ${functionName}`);
    });

    const { getPublicGalleryReplications } = await import("./publicData.replications");
    await expect(getPublicGalleryReplications()).resolves.toEqual(corpus);
  });

  it("leaves every other replication read unfiltered by the exclusion", async () => {
    stubConvex([
      {
        ...contributor({ key: "JOSIE", displayName: "Josie Kins", aliases: ["josie"] }),
        exclude_from_gallery: true,
      },
    ]);

    const { getPublicReplications } = await import("./publicData.effects");
    // The shared corpus read feeds the public API and the permalink walk; the
    // exclusion is a gallery-presentation choice, not an unpublication.
    await expect(getPublicReplications()).resolves.toEqual(corpus);

    mocks.queryConvex.mockReset();
    mocks.queryConvex.mockResolvedValueOnce([work("drifting", "Josie Kins")]);
    const { getPublicReplicationsByEffect } = await import("./publicData.effects");
    // Effect-article replication sections still show an excluded artist's work.
    await expect(getPublicReplicationsByEffect("drifting")).resolves.toEqual([
      work("drifting", "Josie Kins"),
    ]);
  });
});
