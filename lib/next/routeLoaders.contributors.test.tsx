import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildContributorProfile,
  buildReplication,
  buildTripReport,
  getRouteLoaderMocks,
} from "./routeLoaders.testHarness";
import { loadContributorRoute } from "./routeLoaders.contributors";
import { loadReplicationRoute } from "./routeLoaders.replications";
import type { SubjectiveEffectDetailRecord } from "../data/publicData";

const { publicData } = getRouteLoaderMocks();

describe("contributor and replication route loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns contributor ok results for the canonical key", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile(),
    );
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([]);

    const result = await loadContributorRoute("ada");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(publicData.getPublicContributorByKey).toHaveBeenCalledWith("ADA");
    expect(result.metadata).toEqual({
      title: "Ada",
      description: "Browse contributor profile ADA.",
    });
    expect(result.canonicalRoute).toEqual({
      family: "contributor",
      params: { profileKey: "ADA" },
    });
    expect(result.pageProps.profile.key).toBe("ADA");
    expect(result.pageProps.bioContent).toBeNull();
    expect(result.pageProps.reportHrefPrefix).toBe("/reports/");
    expect(result.pageProps.tripReports).toEqual([]);
    expect(result.pageProps.replications).toEqual([]);
  });

  it("uses only a verified delivered avatar and reviewed verification outcome", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile({ avatarUrl: "https://cdn.test/fallback.webp" }),
    );
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([]);
    publicData.getPublicContributorIdentity.mockResolvedValueOnce({
      canonical_key: "ADA",
      aliases: ["old-ada"],
      avatar_url: "https://cdn.test/verified.webp",
      verified_replicator: true,
    });

    const result = await loadContributorRoute("ada");
    if (result.kind !== "ok") throw new Error("expected ok result");
    expect(result.pageProps.profile.avatarUrl).toBe(
      "https://cdn.test/verified.webp",
    );
    expect(result.pageProps.verifiedReplicator).toBe(true);
  });

  it("orders a contributor's replications newest first", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile(),
    );
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([
      buildReplication({ slug: "old", created_at: "2023-01-01T00:00:00.000Z" }),
      buildReplication({ slug: "new", created_at: "2025-01-01T00:00:00.000Z" }),
    ]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.replications.map((work) => work.slug)).toEqual([
      "new",
      "old",
    ]);
  });

  it("puts the newest work first even when an older one is editorially featured", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile(),
    );
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([
      buildReplication({ slug: "new", created_at: "2025-01-01T00:00:00.000Z" }),
      // A real entry from the checked-in Effect Index curation list, which used
      // to float above the default sort. The date outranks it now.
      buildReplication({
        slug: "forest-of-life-loka",
        created_at: "2019-01-01T00:00:00.000Z",
      }),
    ]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.replications.map((work) => work.slug)).toEqual([
      "new",
      "forest-of-life-loka",
    ]);
  });

  it("leads the reports list with the contributor's curated reports", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile({ reportOrder: ["second", "missing"] }),
    );
    publicData.getReportsByContributor.mockResolvedValueOnce([
      buildTripReport({ slug: "first" }),
      buildTripReport({ slug: "second" }),
    ]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.tripReports.map((report) => report.slug)).toEqual([
      "second",
      "first",
    ]);
  });

  it("hands the profile the effect articles crediting the contributor", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile(),
    );
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([]);
    publicData.getEffectArticlesByContributor.mockResolvedValueOnce([
      { slug: "geometry", name: "Geometry" },
    ]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(publicData.getEffectArticlesByContributor).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ADA" }),
    );
    expect(result.pageProps.effectArticles).toEqual([
      { slug: "geometry", name: "Geometry" },
    ]);
  });

  it("hands the profile its reviewed articles by profile key only", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile(),
    );
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([]);
    publicData.getReviewedArticlesByContributor.mockResolvedValueOnce([
      { slug: "2c-b", title: "2C-B", reviewed_at: "2026-08-01T00:00:00.000Z" },
    ]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    // Key-only on purpose: the reviewer-email matching happens inside Postgres,
    // so the loader never handles an email it could leak into page props.
    expect(publicData.getReviewedArticlesByContributor).toHaveBeenCalledWith(
      "ADA",
    );
    expect(result.pageProps.reviewedArticles).toEqual([
      { slug: "2c-b", title: "2C-B", reviewed_at: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("still renders a profile when the replication join is unavailable", async () => {
    // A Postgres deployment that predates `replications:getByArtistNames` reports
    // the same opaque Server Error it uses for everything else, so the profile
    // has to degrade to "no works" rather than fail a prerendered route.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile(),
    );
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockRejectedValueOnce(
      new Error("Server Error"),
    );

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.replications).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns contributor redirect results for alias keys without loading reports", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile({ aliases: ["OLD-KEY"] }),
    );

    await expect(loadContributorRoute("old-key")).resolves.toMatchObject({
      kind: "redirect",
      target: "/contributors/ada",
      canonicalRoute: { family: "contributor", params: { profileKey: "ADA" } },
      socialCardProfileKey: "ADA",
    });
    expect(publicData.getReportsByContributor).not.toHaveBeenCalled();
    expect(publicData.getReplicationsByContributor).not.toHaveBeenCalled();
    expect(publicData.getEffectArticlesByContributor).not.toHaveBeenCalled();
    expect(publicData.getReviewedArticlesByContributor).not.toHaveBeenCalled();
  });

  it("permanently forwards a profile that claims a credited artist to the Artist Page", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile(),
    );
    publicData.getPublicArtistCreditRows.mockResolvedValueOnce([
      buildReplication({ slug: "work-1" }),
      buildReplication({ slug: "work-2" }),
    ]);
    publicData.getPublicContributorDirectory.mockResolvedValueOnce([
      { key: "ADA", displayName: "Ada", aliases: [] },
    ]);

    await expect(loadContributorRoute("ada")).resolves.toMatchObject({
      kind: "redirect",
      target: "/replications/artist/ada",
      canonicalRoute: { family: "replicationArtist", params: { key: "ada" } },
      socialCardProfileKey: "ADA",
    });
    // A forwarded profile is not a page; none of its joins may run.
    expect(publicData.getReportsByContributor).not.toHaveBeenCalled();
    expect(publicData.getReplicationsByContributor).not.toHaveBeenCalled();
    expect(publicData.getEffectArticlesByContributor).not.toHaveBeenCalled();
    expect(publicData.getReviewedArticlesByContributor).not.toHaveBeenCalled();
  });

  it("forwards an alias key straight to the Artist Page in one hop", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile({ aliases: ["OLD-KEY"] }),
    );
    publicData.getPublicArtistCreditRows.mockResolvedValueOnce([
      buildReplication(),
    ]);
    publicData.getPublicContributorDirectory.mockResolvedValueOnce([
      { key: "ADA", displayName: "Ada", aliases: [] },
    ]);

    await expect(loadContributorRoute("old-key")).resolves.toMatchObject({
      kind: "redirect",
      target: "/replications/artist/ada",
      socialCardProfileKey: "ADA",
    });
  });

  it("keeps a profile whose only credited works artist views withhold", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile(),
    );
    publicData.getPublicArtistCreditRows.mockResolvedValueOnce([
      buildReplication({ effect_slug: "unspeakable-horrors" }),
    ]);
    publicData.getPublicContributorDirectory.mockResolvedValueOnce([
      { key: "ADA", displayName: "Ada", aliases: [] },
    ]);
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([]);

    // No Artist Page exists for her (withholding removes the group), so the
    // profile is still this artist's one live surface and must render.
    await expect(loadContributorRoute("ada")).resolves.toMatchObject({
      kind: "ok",
    });
  });

  it("returns contributor not-found results with the normalized key", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(null);

    await expect(loadContributorRoute("missing%20key")).resolves.toEqual({
      kind: "not-found",
      normalizedKey: "MISSING KEY",
    });
  });

  it("hydrates one permalink without constructing a second playlist", async () => {
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "shared", artist: "Ada" }),
    );
    publicData.getPublicEffectBySlug.mockResolvedValueOnce({
      slug: "tracers",
      name: "Tracers",
      summary: "",
      tags: ["visual", "distortion"],
    } as SubjectiveEffectDetailRecord);
    // No profile stub: the direct artist page answers the byline, so an
    // unconsumed once-value here would leak into the next test.

    const result = await loadReplicationRoute("shared");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps).toMatchObject({
      effectName: "Tracers",
      effectSlug: "tracers",
      artistProfileHref: "/replications/artist/ada",
    });
    // avatarUrl was cut from ReplicationPageProps: no renderer ever read it.
    expect(result.pageProps).not.toHaveProperty("avatarUrl");
    expect(
      result.pageProps.effectCategories.map((category) => category.slug),
    ).toEqual(["visual-effects", "visual-distortions"]);
    expect(publicData.getPublicReplicationsByEffect).not.toHaveBeenCalled();
    expect(publicData.getReplicationsByContributor).not.toHaveBeenCalled();
  });

  it("uses a proven creator for the byline while preserving poster provenance", async () => {
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "shared", artist: "ArchivePoster" }),
    );
    publicData.getPublicEffectBySlug.mockResolvedValueOnce(null);
    publicData.getPublicContributorProfiles.mockResolvedValueOnce([
      buildContributorProfile({ key: "CREATOR", displayName: "Documented Creator" }),
    ]);
    publicData.getPublicReplicationIdentityAttribution.mockResolvedValueOnce({
      poster: {
        display_name: "ArchivePoster",
        profile_key: null,
        profile_url: "https://reddit.com/user/ArchivePoster",
        platform: "Reddit",
        posted_at: Date.UTC(2025, 0, 1),
      },
      creator: {
        display_name: "Documented Creator",
        profile_key: "CREATOR",
      },
      proven_different_creator: true,
    });

    const result = await loadReplicationRoute("shared");
    if (result.kind !== "ok") throw new Error("expected ok result");
    expect(result.metadata.title).toBe("Base by Documented Creator");
    expect(result.pageProps.artistProfileHref).toBe("/contributors/creator");
    expect(result.pageProps.identityAttribution?.poster.display_name).toBe(
      "ArchivePoster",
    );
  });

  it("gives a figure no permalink, so nothing calls a diagram a replication", async () => {
    // This page states what the row is three times over — in the breadcrumb and
    // "Replicates" prose, in the `<title>`/description, and in JSON-LD naming it
    // an ImageObject described as "A replication of the subjective effect X".
    // The last two are claims published to crawlers, so a figure has to 404
    // rather than render, and 404ing here is also what keeps it out of the
    // sitemap's companion `generateStaticParams` list.
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "vertebral-column-diagram", role: "figure" }),
    );

    await expect(
      loadReplicationRoute("vertebral-column-diagram"),
    ).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("gives an audio row a permalink, since the page now plays it", async () => {
    // It used to resolve not-found: the detail page branched on `type ===
    // "video"` with an image fallback, so a clip would have rendered
    // `<AppImage src="….mp3">` beneath a pill reading "Image". The page has a
    // real audio branch now, so the row is publishable and addressable.
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "a-recording", type: "audio", format: "mp3" }),
    );
    publicData.getPublicEffectBySlug.mockResolvedValueOnce(null);

    const result = await loadReplicationRoute("a-recording");

    if (result.kind !== "ok") throw new Error("expected an ok result");
    expect(result.pageProps.replication.slug).toBe("a-recording");
    expect(result.pageProps.replication.type).toBe("audio");
  });

  it("still renders an ordinary stored row, which carries no role at all", async () => {
    const stored = buildReplication({ slug: "tree-bark", artist: "Unknown" });
    expect(stored.role).toBeUndefined();

    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(stored);
    publicData.getPublicEffectBySlug.mockResolvedValueOnce({
      slug: "tracers",
      name: "Tracers",
      summary: "",
      tags: ["visual"],
    } as SubjectiveEffectDetailRecord);

    const result = await loadReplicationRoute("tree-bark");

    expect(result.kind).toBe("ok");
  });

  it("skips profile and playlist reads for an unattributed replication", async () => {
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "shared", artist: "Unknown" }),
    );
    publicData.getPublicEffectBySlug.mockResolvedValue({
      slug: "tracers",
      name: "Tracers",
      summary: "",
      tags: ["visual"],
    } as SubjectiveEffectDetailRecord);

    const result = await loadReplicationRoute("shared");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.effectName).toBe("Tracers");
    expect(result.pageProps.artistProfileHref).toBeNull();
    expect(publicData.getPublicContributorProfiles).not.toHaveBeenCalled();
    expect(publicData.getPublicReplicationsByEffect).not.toHaveBeenCalled();
    expect(publicData.getReplicationsByContributor).not.toHaveBeenCalled();
  });

  it("links a named unclaimed credit to its generated Artist Page", async () => {
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "shared", artist: "Unclaimed Artist" }),
    );
    publicData.getPublicEffectBySlug.mockResolvedValueOnce({
      slug: "tracers",
      name: "Tracers",
      summary: "",
      tags: ["visual"],
    } as SubjectiveEffectDetailRecord);
    publicData.getPublicContributorProfiles.mockResolvedValueOnce([
      buildContributorProfile({ key: "ADA", displayName: "Ada" }),
    ]);

    const result = await loadReplicationRoute("shared");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.artistProfileHref).toBe(
      "/replications/artist/unclaimed-artist",
    );
    expect(publicData.getPublicReplicationsByEffect).not.toHaveBeenCalled();
    expect(publicData.getReplicationsByContributor).not.toHaveBeenCalled();
  });
});
