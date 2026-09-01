import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("../entitySocialCardManifest.generated.json");
  vi.resetModules();
});

const manifest = {
  version: 1,
  sourceDeployment: "glad-minnow-656",
  rendererVersions: {
    effects: "test",
    replications: "test",
    reports: "test",
    contributors: "test",
  },
  cards: {
    effects: {
      geometry: "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/01/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.jpg",
    },
    replications: {
      "infinite-torus-space-symmetric-vision":
        "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/ab/abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789.jpg",
    },
    reports: {},
    contributors: {},
  },
};

describe("entitySocialCardUrl", () => {
  it("returns a normalized immutable JPEG card for dose.wiki", async () => {
    vi.doMock("../entitySocialCardManifest.generated.json", () => ({ default: manifest }));
    const {
      entitySocialCardImage,
      entitySocialCardUrl,
      replicationViewerSocialCardImage,
    } = await import("./entitySocialCardUrl");

    expect(entitySocialCardUrl("effects", " Geometry ")).toBe(
      "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/01/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.jpg",
    );
    expect(entitySocialCardImage("effects", "geometry", "Geometry effect card")).toEqual({
      path: "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/01/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.jpg",
      width: 1200,
      height: 1200,
      alt: "Geometry effect card",
    });
    expect(entitySocialCardUrl("effects", "unknown")).toBeNull();
    expect(
      replicationViewerSocialCardImage({
        viewer: "infinite-torus-space-symmetric-vision",
      }),
    ).toEqual({
      path: "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/ab/abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789.jpg",
      width: 1200,
      height: 1200,
      alt: "Linked replication card",
    });
    expect(
      replicationViewerSocialCardImage({ viewer: ["first", "second"] }),
    ).toBeUndefined();
    expect(
      replicationViewerSocialCardImage({ viewer: "unknown" }),
    ).toBeUndefined();
  });

  it("makes the same immutable entity card available to Effect Index", async () => {
    vi.doMock("../entitySocialCardManifest.generated.json", () => ({ default: manifest }));
    const { entitySocialCardImage, entitySocialCardUrl } = await import(
      "./entitySocialCardUrl"
    );

    expect(entitySocialCardUrl("effects", "geometry")).toBe(
      "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/01/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.jpg",
    );
    expect(entitySocialCardImage("effects", "geometry", "Geometry")).toEqual({
      path: "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/01/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.jpg",
      width: 1200,
      height: 1200,
      alt: "Geometry",
    });
  });

  it("keeps host-specific canonicals while sharing an immutable entity image", async () => {
    vi.doMock("../entitySocialCardManifest.generated.json", () => ({ default: manifest }));
    const [{ entitySocialCardImage }, { buildPublicPageMetadata, getPublicSite }, { SITE_FLAVOR_CONFIGS }] =
      await Promise.all([
        import("./entitySocialCardUrl"),
        import("../../../lib/next/publicSite"),
        import("../../config/siteFlavor"),
      ]);
    const socialImage = entitySocialCardImage(
      "replications",
      "infinite-torus-space-symmetric-vision",
      "Infinite Torus Space replication card",
    );

    const doseWikiMetadata = buildPublicPageMetadata(
      {
        title: "Infinite Torus Space",
        description: "A subjective-effect replication by Symmetric Vision.",
        route: {
          family: "replication",
          params: { slug: "infinite-torus-space-symmetric-vision" },
        },
        socialImage,
      },
      getPublicSite(SITE_FLAVOR_CONFIGS.dosewiki, {}),
    );
    const effectIndexMetadata = buildPublicPageMetadata(
      {
        title: "Infinite Torus Space",
        description: "A subjective-effect replication by Symmetric Vision.",
        route: {
          family: "replication",
          params: { slug: "infinite-torus-space-symmetric-vision" },
        },
        socialImage,
      },
      getPublicSite(SITE_FLAVOR_CONFIGS.effectindex, {}),
    );
    const immutableCardUrl = manifest.cards.replications[
      "infinite-torus-space-symmetric-vision"
    ];

    expect(doseWikiMetadata.alternates?.canonical).toBe(
      "https://dose.wiki/replications/infinite-torus-space-symmetric-vision",
    );
    expect(effectIndexMetadata.alternates?.canonical).toBe(
      "https://effectindex.com/replications/infinite-torus-space-symmetric-vision",
    );
    expect(doseWikiMetadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: immutableCardUrl }),
    ]);
    expect(effectIndexMetadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: immutableCardUrl }),
    ]);
    expect(doseWikiMetadata.twitter?.images).toEqual([immutableCardUrl]);
    expect(effectIndexMetadata.twitter?.images).toEqual([immutableCardUrl]);
  });

  it("falls back to each publication card only when the entity has no card", async () => {
    vi.doMock("../entitySocialCardManifest.generated.json", () => ({ default: manifest }));
    const [{ entitySocialCardImage }, { buildPublicPageMetadata, getPublicSite }, { SITE_FLAVOR_CONFIGS }] =
      await Promise.all([
        import("./entitySocialCardUrl"),
        import("../../../lib/next/publicSite"),
        import("../../config/siteFlavor"),
      ]);
    const input = {
      title: "Missing replication",
      description: "A replication without a generated social card.",
      route: {
        family: "replication" as const,
        params: { slug: "missing-replication" },
      },
      socialImage: entitySocialCardImage(
        "replications",
        "missing-replication",
        "Missing replication card",
      ),
    };

    const doseWikiMetadata = buildPublicPageMetadata(
      input,
      getPublicSite(SITE_FLAVOR_CONFIGS.dosewiki, {}),
    );
    const effectIndexMetadata = buildPublicPageMetadata(
      input,
      getPublicSite(SITE_FLAVOR_CONFIGS.effectindex, {}),
    );

    expect(doseWikiMetadata.twitter?.images).toEqual([
      "https://dose.wiki/icon-512.png",
    ]);
    expect(effectIndexMetadata.twitter?.images).toEqual([
      "https://effectindex.com/effectindex/social-card.png",
    ]);
  });
});
