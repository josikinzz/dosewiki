import { PUBLIC_SITE } from "@server/next/publicSite";
import { describe, expect, it, vi } from "vitest";
import type { PublicGalleryReplicationPreview } from "@/types/replications";

const pageMocks = vi.hoisted(() => ({
  explorer: vi.fn(() => null),
  viewerHost: vi.fn(({ children }) => children),
  getGalleryBrowsePage: vi.fn(),
  getGalleryRouteBootstrap: vi.fn(),
  getPublicGalleryReplications: vi.fn(),
  getPublicGalleryReplicationBySlug: vi.fn(),
  getPublicEffects: vi.fn(),
  getPublicContributorDirectory: vi.fn(),
}));

vi.mock("@server/next/copyBlocks", () => ({
  getCopyByKeys: async () => ({
    text: () => "Replication gallery description.",
  }),
}));

vi.mock("@/data/entitySocialCardManifest.generated.json", () => ({
  default: {
    version: 1,
    rendererVersions: {
      effects: "test",
      replications: "test",
      reports: "test",
      contributors: "test",
    },
    cards: {
      effects: {},
      replications: {
        "infinite-torus-space-symmetric-vision":
          "/images/social/entities/replications/infinite-torus-space-symmetric-vision.abcdef0123456789.jpg",
      },
      reports: {},
      contributors: {},
    },
  },
}));

vi.mock("@/features/replications/ReplicationsGalleryExplorer", () => ({
  ReplicationsGalleryExplorer: pageMocks.explorer,
}));
vi.mock("@/features/replications/components/ReplicationsTabNav", () => ({
  ReplicationsTabNav: () => null,
}));
vi.mock("@/features/replications/components/GalleryViewerHost", () => ({
  GalleryViewerHost: pageMocks.viewerHost,
}));
vi.mock("@server/next/galleryBrowsePage", () => ({
  getGalleryBrowsePage: pageMocks.getGalleryBrowsePage,
}));
vi.mock("@server/next/galleryRouteData", () => ({
  getGalleryRouteBootstrap: pageMocks.getGalleryRouteBootstrap,
}));
vi.mock("@server/data/publicData", () => ({
  getPublicGalleryReplications: pageMocks.getPublicGalleryReplications,
  getPublicGalleryReplicationBySlug:
    pageMocks.getPublicGalleryReplicationBySlug,
  getPublicEffects: pageMocks.getPublicEffects,
  getPublicContributorDirectory: pageMocks.getPublicContributorDirectory,
}));
let indexRevision = 0;
vi.mock("@server/next/galleryBrowseIndex", () => ({
  getGalleryBrowseIndex: async () => {
    const [rows, effects, directory] = await Promise.all([
      pageMocks.getPublicGalleryReplications(), pageMocks.getPublicEffects(), pageMocks.getPublicContributorDirectory(),
    ]);
    const canonical = { rows, effects, directory, translationHashes: [] };
    const revision = String(++indexRevision);
    return { ...canonical, canonical, revision, cacheIdentity: revision };
  },
  hydrateGalleryPage: async (rows: PublicGalleryReplicationPreview[]) => rows,
}));

import { generateMetadata } from "./page";
import ReplicationViewerPage, {
  generateMetadata as generateViewerMetadata,
} from "./viewer/[slug]/page";

const linkedCardUrl = `${PUBLIC_SITE.url}/images/social/entities/replications/infinite-torus-space-symmetric-vision.abcdef0123456789.jpg`;

describe("replications gallery metadata", () => {
  it("keeps the static index on the section card and canonical", async () => {
    const metadata = await generateMetadata();

    expect(metadata.openGraph?.images).toBeDefined();
    expect(JSON.stringify(metadata.openGraph?.images)).not.toContain(linkedCardUrl);
    expect(metadata.alternates?.canonical).toBe(`${PUBLIC_SITE.url}/replications`);
  });

  it("gives a viewer deep-link document the active replication card", async () => {
    const metadata = await generateViewerMetadata({
      params: Promise.resolve({ slug: "infinite-torus-space-symmetric-vision" }),
    });

    expect(metadata.openGraph?.images).toEqual([
      {
        url: linkedCardUrl,
        width: 1200,
        height: 1200,
        alt: "Linked replication card",
      },
    ]);
    expect(metadata.twitter?.images).toEqual([linkedCardUrl]);
    // The deep link is a state of the gallery, never a second indexable page.
    expect(metadata.alternates?.canonical).toBe(`${PUBLIC_SITE.url}/replications`);
  });
});

describe("replications route shells", () => {

  it("rejects an invalid viewer slug", async () => {
    await expect(
      ReplicationViewerPage({ params: Promise.resolve({ slug: "%$" }) }),
    ).rejects.toThrow();
  });
});

