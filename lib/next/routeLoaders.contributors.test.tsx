import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildContributorProfile,
  buildReplication,
  buildTripReport,
  getRouteLoaderMocks,
} from "./routeLoaders.testHarness";
import { loadContributorRoute } from "./routeLoaders.contributors";
import { loadReplicationRoute } from "./routeLoaders.replications";
import type { SubjectiveEffectDetailRecord } from "../convex/publicData";

const { publicData } = getRouteLoaderMocks();

describe("contributor and replication route loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns contributor ok results for the canonical key", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(buildContributorProfile());
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
    expect(result.canonicalRoute).toEqual({ family: "contributor", params: { profileKey: "ADA" } });
    expect(result.pageProps.profile.key).toBe("ADA");
    expect(result.pageProps.bioContent).toBeNull();
    expect(result.pageProps.reportHrefPrefix).toBe("/reports/");
    expect(result.pageProps.tripReports).toEqual([]);
    expect(result.pageProps.replications).toEqual([]);
  });

  it("orders a contributor's replications newest first", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(buildContributorProfile());
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([
      buildReplication({ slug: "old", created_at: "2023-01-01T00:00:00.000Z" }),
      buildReplication({ slug: "new", created_at: "2025-01-01T00:00:00.000Z" }),
    ]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.replications.map((work) => work.slug)).toEqual(["new", "old"]);
  });

  it("leads a contributor's rail with their curated works", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(buildContributorProfile());
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([
      buildReplication({ slug: "new", created_at: "2025-01-01T00:00:00.000Z" }),
      // A real entry from the checked-in curation list, so this test fails if
      // the list is ever repointed without the rail following.
      buildReplication({ slug: "forest-of-life-loka", created_at: "2019-01-01T00:00:00.000Z" }),
    ]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.replications.map((work) => work.slug)).toEqual([
      "forest-of-life-loka",
      "new",
    ]);
  });

  it("leaves the rail untouched for a contributor with nothing curated", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(buildContributorProfile());
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([
      buildReplication({ slug: "old", created_at: "2023-01-01T00:00:00.000Z" }),
      buildReplication({ slug: "new", created_at: "2025-01-01T00:00:00.000Z" }),
    ]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    // Only 36 works are curated corpus-wide, so this is the common case and it
    // must stay a pure no-op.
    expect(result.pageProps.replications.map((work) => work.slug)).toEqual(["new", "old"]);
  });

  it("puts the contributor's own curation ahead of the editorial list", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile({ replicationOrder: ["old", "gone"] }),
    );
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([
      buildReplication({ slug: "new", created_at: "2025-01-01T00:00:00.000Z" }),
      buildReplication({ slug: "old", created_at: "2023-01-01T00:00:00.000Z" }),
      // Editorial curation still floats its pick above the default sort, but
      // below anything the contributor pinned themselves.
      buildReplication({ slug: "forest-of-life-loka", created_at: "2019-01-01T00:00:00.000Z" }),
    ]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    // "gone" matches no work and is simply ignored.
    expect(result.pageProps.replications.map((work) => work.slug)).toEqual([
      "old",
      "forest-of-life-loka",
      "new",
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
    expect(result.pageProps.tripReports.map((report) => report.slug)).toEqual(["second", "first"]);
  });

  it("hands the profile the effect articles crediting the contributor", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(buildContributorProfile());
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
    expect(result.pageProps.effectArticles).toEqual([{ slug: "geometry", name: "Geometry" }]);
  });

  it("hands the profile its reviewed articles by profile key only", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(buildContributorProfile());
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([]);
    publicData.getReviewedArticlesByContributor.mockResolvedValueOnce([
      { slug: "2c-b", title: "2C-B", reviewed_at: "2026-08-01T00:00:00.000Z" },
    ]);

    const result = await loadContributorRoute("ada");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    // Key-only on purpose: the reviewer-email matching happens inside Convex,
    // so the loader never handles an email it could leak into page props.
    expect(publicData.getReviewedArticlesByContributor).toHaveBeenCalledWith("ADA");
    expect(result.pageProps.reviewedArticles).toEqual([
      { slug: "2c-b", title: "2C-B", reviewed_at: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("still renders a profile when the replication join is unavailable", async () => {
    // A Convex deployment that predates `replications:getByArtistNames` reports
    // the same opaque Server Error it uses for everything else, so the profile
    // has to degrade to "no works" rather than fail a prerendered route.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    publicData.getPublicContributorByKey.mockResolvedValueOnce(buildContributorProfile());
    publicData.getReportsByContributor.mockResolvedValueOnce([]);
    publicData.getReplicationsByContributor.mockRejectedValueOnce(new Error("Server Error"));

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
    });
    expect(publicData.getReportsByContributor).not.toHaveBeenCalled();
    expect(publicData.getReplicationsByContributor).not.toHaveBeenCalled();
    expect(publicData.getEffectArticlesByContributor).not.toHaveBeenCalled();
    expect(publicData.getReviewedArticlesByContributor).not.toHaveBeenCalled();
  });

  it("returns contributor not-found results with the normalized key", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(null);

    await expect(loadContributorRoute("missing%20key")).resolves.toEqual({
      kind: "not-found",
      normalizedKey: "MISSING KEY",
    });
  });

  it("surrounds an attributed replication with its artist's other works", async () => {
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "shared", artist: "Ada" }),
    );
    publicData.getPublicEffectBySlug.mockResolvedValueOnce({
      slug: "tracers",
      name: "Tracers",
      summary: "",
      tags: ["visual", "distortion"],
    } as SubjectiveEffectDetailRecord);
    publicData.getPublicReplicationsByEffect.mockResolvedValueOnce([
      buildReplication({ slug: "shared" }),
      buildReplication({ slug: "by-someone-else", artist: "Someone Else" }),
    ]);
    publicData.getPublicContributorProfiles.mockResolvedValueOnce([
      buildContributorProfile({ key: "ADA", displayName: "Ada" }),
    ]);
    publicData.getReplicationsByContributor.mockResolvedValueOnce([
      buildReplication({ slug: "shared", created_at: "2025-02-01T00:00:00.000Z" }),
      buildReplication({ slug: "other-tracer", created_at: "2025-01-01T00:00:00.000Z" }),
    ]);

    const result = await loadReplicationRoute("shared");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.neighbors.scope).toBe("artist");
    expect(result.pageProps.neighbors.scopeLabel).toBe("Ada");
    expect(result.pageProps.neighbors.next?.slug).toBe("other-tracer");
    expect(result.pageProps.artistProfileHref).toBe("/contributors/ada");
    expect(result.pageProps.effectCategories.map((category) => category.slug)).toEqual([
      "visual-effects",
      "visual-distortions",
    ]);
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

    await expect(loadReplicationRoute("vertebral-column-diagram")).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("gives an audio row no permalink rather than describing it as an image", async () => {
    // The detail page branches `type === "video"` with an image fallback, so an
    // audio row would render `<AppImage src="….mp3">` beneath a pill reading
    // "Image" and offer an "Open full size" link to the audio file.
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "a-recording", type: "audio", format: "mp3" }),
    );

    await expect(loadReplicationRoute("a-recording")).resolves.toEqual({ kind: "not-found" });
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

  it("falls back to the effect's works for an unattributed replication", async () => {
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "shared", artist: "Unknown" }),
    );
    publicData.getPublicEffectBySlug.mockResolvedValueOnce({
      slug: "tracers",
      name: "Tracers",
      summary: "",
      tags: ["visual"],
    } as SubjectiveEffectDetailRecord);
    publicData.getPublicReplicationsByEffect.mockResolvedValueOnce([
      buildReplication({ slug: "shared", created_at: "2025-02-01T00:00:00.000Z" }),
      buildReplication({ slug: "sibling", created_at: "2025-01-01T00:00:00.000Z" }),
    ]);

    const result = await loadReplicationRoute("shared");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.neighbors.scope).toBe("effect");
    expect(result.pageProps.neighbors.scopeLabel).toBe("Tracers");
    expect(result.pageProps.neighbors.next?.slug).toBe("sibling");
    expect(result.pageProps.artistProfileHref).toBeNull();
    // An unattributed marker can never resolve to a profile, so the lookup is
    // skipped rather than run and discarded.
    expect(publicData.getPublicContributorProfiles).not.toHaveBeenCalled();
    expect(publicData.getReplicationsByContributor).not.toHaveBeenCalled();
  });

  it("keeps the effect walk when the artist's works cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "shared", artist: "Ada" }),
    );
    publicData.getPublicEffectBySlug.mockResolvedValueOnce({
      slug: "tracers",
      name: "Tracers",
      summary: "",
      tags: ["visual"],
    } as SubjectiveEffectDetailRecord);
    publicData.getPublicReplicationsByEffect.mockResolvedValueOnce([
      buildReplication({ slug: "shared" }),
      buildReplication({ slug: "sibling" }),
    ]);
    publicData.getPublicContributorProfiles.mockResolvedValueOnce([
      buildContributorProfile({ key: "ADA", displayName: "Ada" }),
    ]);
    publicData.getReplicationsByContributor.mockRejectedValueOnce(new Error("Server Error"));

    const result = await loadReplicationRoute("shared");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.neighbors.scope).toBe("effect");
    // The byline still resolves: the profile exists, only its works did not load.
    expect(result.pageProps.artistProfileHref).toBe("/contributors/ada");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("gives a named credit with no profile the effect walk and no profile link", async () => {
    publicData.getPublicReplicationBySlug.mockResolvedValueOnce(
      buildReplication({ slug: "shared", artist: "Unclaimed Artist" }),
    );
    publicData.getPublicEffectBySlug.mockResolvedValueOnce({
      slug: "tracers",
      name: "Tracers",
      summary: "",
      tags: ["visual"],
    } as SubjectiveEffectDetailRecord);
    publicData.getPublicReplicationsByEffect.mockResolvedValueOnce([
      buildReplication({ slug: "shared" }),
      buildReplication({ slug: "sibling" }),
    ]);
    publicData.getPublicContributorProfiles.mockResolvedValueOnce([
      buildContributorProfile({ key: "ADA", displayName: "Ada" }),
    ]);

    const result = await loadReplicationRoute("shared");

    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.pageProps.artistProfileHref).toBeNull();
    expect(result.pageProps.neighbors.scope).toBe("effect");
    // Without a profile there is no name set to join on, so no works are read.
    expect(publicData.getReplicationsByContributor).not.toHaveBeenCalled();
  });
});
