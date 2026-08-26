import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@/config/siteFlavor");
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
      geometry: "/images/social/entities/effects/geometry.0123456789abcdef.jpg",
    },
    replications: {
      "infinite-torus-space-symmetric-vision":
        "/images/social/entities/replications/infinite-torus-space-symmetric-vision.abcdef0123456789.jpg",
    },
    reports: {},
    contributors: {},
  },
};

describe("entitySocialCardUrl", () => {
  it("returns a normalized immutable JPEG card for dose.wiki", async () => {
    vi.doMock("@/config/siteFlavor", () => ({ isEffectIndex: () => false }));
    vi.doMock("../entitySocialCardManifest.generated.json", () => ({ default: manifest }));
    const {
      entitySocialCardImage,
      entitySocialCardUrl,
      replicationViewerSocialCardImage,
    } = await import("./entitySocialCardUrl");

    expect(entitySocialCardUrl("effects", " Geometry ")).toBe(
      "/images/social/entities/effects/geometry.0123456789abcdef.jpg",
    );
    expect(entitySocialCardImage("effects", "geometry", "Geometry effect card")).toEqual({
      path: "/images/social/entities/effects/geometry.0123456789abcdef.jpg",
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
      path: "/images/social/entities/replications/infinite-torus-space-symmetric-vision.abcdef0123456789.jpg",
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

  it("keeps Effect Index on its publication-wide social card", async () => {
    vi.doMock("@/config/siteFlavor", () => ({ isEffectIndex: () => true }));
    vi.doMock("../entitySocialCardManifest.generated.json", () => ({ default: manifest }));
    const { entitySocialCardImage, entitySocialCardUrl } = await import(
      "./entitySocialCardUrl"
    );

    expect(entitySocialCardUrl("effects", "geometry")).toBeNull();
    expect(entitySocialCardImage("effects", "geometry", "Geometry")).toBeUndefined();
  });
});
