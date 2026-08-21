import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildContributorProfile,
  buildReplication,
  getRouteLoaderMocks,
} from "./routeLoaders.testHarness";
import {
  loadArtistReplicationWalk,
  loadEffectPlaylistRoute,
  loadSubstancePlaylistRoute,
  loadSubstancePlaylistStaticParams,
} from "./routeLoaders.replications";

const { publicData } = getRouteLoaderMocks();

const TRACERS_EFFECT = {
  slug: "tracers",
  name: "Tracers",
  summary: "",
  tags: ["visual", "distortion"],
  gallery_order: ["second-work", "first-work"],
};

describe("effect playlist route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicData.getPublicEffectBySlug.mockImplementation(async (slug: string) =>
      slug === "tracers" ? TRACERS_EFFECT : null,
    );
    publicData.getPublicReplicationsByEffect.mockResolvedValue([
      buildReplication({ slug: "first-work", title: "First", effect_slug: "tracers" }),
      buildReplication({ slug: "second-work", title: "Second", effect_slug: "tracers" }),
    ]);
  });

  it("resolves the canonical route with the curated walk opening at item one", async () => {
    const result = await loadEffectPlaylistRoute("tracers");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.canonicalRoute).toEqual({
      family: "replicationEffect",
      params: { slug: "tracers" },
    });
    expect(result.pageProps.viewerSet.scope).toBe("effect");
    expect(result.pageProps.viewerSet.scopeLabel).toBe("Tracers");
    // The curated gallery order decides item one, so a shared playlist URL
    // opens every reader at the same first work.
    expect(result.pageProps.viewerSet.items.map((item) => item.replication.slug)).toEqual([
      "second-work",
      "first-work",
    ]);
    expect(result.pageProps.viewerSet.items[0]).toMatchObject({
      effectName: "Tracers",
      effectSlug: "tracers",
    });
    expect(result.metadata.title).toBe("Tracers — Replications");
  });

  it("drops rows the viewer cannot draw before deciding emptiness", async () => {
    publicData.getPublicReplicationsByEffect.mockResolvedValue([
      buildReplication({ slug: "broken", effect_slug: "tracers", url: "" }),
    ]);

    await expect(loadEffectPlaylistRoute("tracers")).resolves.toEqual({ kind: "not-found" });
  });

  it("hydrates each item's avatar from the claiming profile, null when nobody claims it", async () => {
    publicData.getPublicReplicationsByEffect.mockResolvedValue([
      // Ada's credit is claimed by a profile carrying an avatar; the other
      // credit names a person no profile claims.
      buildReplication({ slug: "first-work", title: "First", effect_slug: "tracers", artist: "Nobody Known" }),
      buildReplication({ slug: "second-work", title: "Second", effect_slug: "tracers", artist: "Ada" }),
    ]);
    publicData.getPublicContributorProfiles.mockResolvedValueOnce([
      buildContributorProfile({
        key: "ADA",
        displayName: "Ada",
        avatarUrl: "https://cdn.test/ada.webp",
      }),
    ]);

    const result = await loadEffectPlaylistRoute("tracers");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // The curated order opens on Ada's work; her avatar rides on the item.
    expect(result.pageProps.viewerSet.items.map((item) => item.avatarUrl)).toEqual([
      "https://cdn.test/ada.webp",
      null,
    ]);
  });

  it("404s a bogus slug with no works behind it", async () => {
    publicData.getPublicReplicationsByEffect.mockResolvedValue([]);

    await expect(loadEffectPlaylistRoute("no-such-effect")).resolves.toEqual({
      kind: "not-found",
    });
  });
});

describe("substance playlist route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicData.getPublicEffectBySlug.mockImplementation(async (slug: string) =>
      slug === "tracers" ? TRACERS_EFFECT : null,
    );
    publicData.getPublicSubstanceBySlug.mockResolvedValue({ title: "LSD", slug: "lsd" });
    publicData.getPublicReplicationsForSubstance.mockResolvedValue({
      items: [
        {
          replication: buildReplication({ slug: "hand-wave", effect_slug: "tracers" }),
          provenance: { matchedVia: "effect_slug", effectSlug: "tracers" },
        },
        {
          // No effect of its own: the caption falls back to the
          // substance-derived match that put it in the gallery.
          replication: buildReplication({ slug: "wood-grain", effect_slug: undefined }),
          provenance: { matchedVia: "effect_tags", effectSlug: "drifting" },
        },
      ],
      unmatchedEffectNames: [],
    });
  });

  it("resolves a curated substance at its first showcased work", async () => {
    const result = await loadSubstancePlaylistRoute("lsd");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.canonicalRoute).toEqual({
      family: "replicationSubstance",
      params: { slug: "lsd" },
    });
    expect(result.pageProps.viewerSet.scope).toBe("substance");
    expect(result.pageProps.viewerSet.scopeLabel).toBe("LSD");
    expect(result.pageProps.viewerSet.items.map((item) => item.replication.slug)).toEqual([
      "hand-wave",
      "wood-grain",
    ]);
    expect(result.pageProps.viewerSet.items[1]).toMatchObject({
      effectSlug: "drifting",
      effectName: null,
    });
    expect(result.metadata.title).toBe("LSD — Replications");
  });

  it("404s an uncurated substance whose article exists", async () => {
    publicData.getPublicReplicationsForSubstance.mockResolvedValue({
      items: [],
      unmatchedEffectNames: [],
    });

    await expect(loadSubstancePlaylistRoute("aspirin")).resolves.toEqual({ kind: "not-found" });
  });

  it("404s a bogus slug", async () => {
    publicData.getPublicReplicationsForSubstance.mockResolvedValue({
      items: [],
      unmatchedEffectNames: [],
    });
    publicData.getPublicSubstanceBySlug.mockResolvedValue(null);

    await expect(loadSubstancePlaylistRoute("no-such-substance")).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("prerenders exactly the substances whose galleries hold a renderable work", async () => {
    publicData.getPublicSubstances.mockResolvedValue([
      { slug: "lsd", title: "LSD", summary: "" },
      { slug: "aspirin", title: "Aspirin", summary: "" },
    ]);
    publicData.getPublicReplicationsForSubstance.mockImplementation(async (slug: string) =>
      slug === "lsd"
        ? {
            items: [
              {
                replication: buildReplication({ slug: "hand-wave", effect_slug: "tracers" }),
                provenance: { matchedVia: "effect_slug", effectSlug: "tracers" },
              },
            ],
            unmatchedEffectNames: [],
          }
        : { items: [], unmatchedEffectNames: [] },
    );

    await expect(loadSubstancePlaylistStaticParams()).resolves.toEqual([{ slug: "lsd" }]);
  });
});

describe("artist replication walk loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicData.getPublicEffectBySlug.mockResolvedValue(null);
    publicData.getPublicContributorDirectory.mockResolvedValue([]);
    publicData.getPublicReplications.mockResolvedValue([
      buildReplication({ slug: "waves", artist: "Chelsea Morgan" }),
      buildReplication({ slug: "sparks", artist: "Chelsea Morgan" }),
      buildReplication({ slug: "other", artist: "Someone Else" }),
    ]);
  });

  it("resolves an artist key to that artist's ordered works", async () => {
    const walk = await loadArtistReplicationWalk("chelsea-morgan");

    expect(walk).not.toBeNull();
    expect(walk?.scopeLabel).toBe("Chelsea Morgan");
    expect(walk?.items.map((item) => item.replication.slug)).toEqual(
      expect.arrayContaining(["waves", "sparks"]),
    );
    expect(walk?.items).toHaveLength(2);
  });

  it("answers a claiming profile that carries no avatar with null, not a placeholder", async () => {
    publicData.getPublicContributorProfiles.mockResolvedValueOnce([
      buildContributorProfile({ key: "CHELSEA", displayName: "Chelsea Morgan" }),
    ]);

    const walk = await loadArtistReplicationWalk("chelsea-morgan");

    expect(walk).not.toBeNull();
    expect(walk?.items.map((item) => item.avatarUrl)).toEqual([null, null]);
  });

  it("answers a bogus key with null", async () => {
    await expect(loadArtistReplicationWalk("no-such-artist")).resolves.toBeNull();
  });
});
