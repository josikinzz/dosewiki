import { PUBLIC_SITE } from "@server/next/publicSite";
import { describe, expect, it, vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  explorer: vi.fn(() => null),
  getPublicGalleryReplicationPage: vi.fn(),
  getPublicGalleryReplicationBySlug: vi.fn(),
  getPublicEffects: vi.fn(),
  getPublicContributorDirectory: vi.fn(),
}));

vi.mock("@server/next/copyBlocks", () => ({
  getCopy: async () => ({
    text: () => "Replication gallery description.",
  }),
}));

vi.mock("@/data/entitySocialCardManifest.generated.json", () => ({
  default: {
    version: 1,
    sourceDeployment: "test",
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
vi.mock("@server/convex/publicData", () => ({
  getPublicGalleryReplicationPage: pageMocks.getPublicGalleryReplicationPage,
  getPublicGalleryReplicationBySlug:
    pageMocks.getPublicGalleryReplicationBySlug,
  getPublicEffects: pageMocks.getPublicEffects,
  getPublicContributorDirectory: pageMocks.getPublicContributorDirectory,
}));

import ReplicationsPage, { generateMetadata } from "./page";

describe("replications playlist metadata", () => {
  it("uses the active immersive-view replication card", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({
        viewer: "infinite-torus-space-symmetric-vision",
      }),
    });
    const cardUrl = `${PUBLIC_SITE.url}/images/social/entities/replications/infinite-torus-space-symmetric-vision.abcdef0123456789.jpg`;

    expect(metadata.openGraph?.images).toEqual([
      {
        url: cardUrl,
        width: 1200,
        height: 1200,
        alt: "Linked replication card",
      },
    ]);
    expect(metadata.twitter?.images).toEqual([cardUrl]);
    expect(metadata.alternates?.canonical).toBe(`${PUBLIC_SITE.url}/replications`);
  });
});

describe("replications first page", () => {
  it("server-renders one bounded page and forwards its continuation", async () => {
    const preview = {
      _id: "work-id",
      slug: "work",
      title: "Work",
      artist: "Artist",
      type: "image",
      format: "webp",
      effect_slug: "geometry",
      url: "https://media.example/work.webp",
      created_at: "2026-01-01",
    };
    pageMocks.getPublicGalleryReplicationPage.mockResolvedValueOnce({
      items: [preview],
      cursor: "opaque-next",
      isDone: false,
    });
    pageMocks.getPublicEffects.mockResolvedValueOnce([
      { slug: "geometry", name: "Geometry" },
    ]);
    const directory = [
      {
        key: "first",
        displayName: "First Artist",
        aliases: [],
        avatarUrl: "https://media.example/first-avatar.webp",
      },
      {
        key: "deferred",
        displayName: "Deferred Artist",
        aliases: ["Later Credit"],
        avatarUrl: "https://media.example/deferred-avatar.webp",
        replicationOrder: ["later-work"],
      },
    ];
    pageMocks.getPublicContributorDirectory.mockResolvedValueOnce(directory);

    const page = await ReplicationsPage({
      searchParams: Promise.resolve({}),
    });
    const explorer = page.props.children[2];

    expect(pageMocks.getPublicGalleryReplicationPage).toHaveBeenCalledWith(
      undefined,
      64,
    );
    expect(explorer.props).toMatchObject({
      replications: [preview],
      continuationCursor: "opaque-next",
      hasMoreReplications: true,
      deferredReplicationsUrl: "/api/replications/gallery",
      contributorDirectory: directory,
    });
  });

  it("server-renders a bounded viewer lookup when the linked work is beyond the first page", async () => {
    const firstPageWork = {
      _id: "first-id",
      slug: "first-work",
      title: "First work",
      artist: "First Artist",
      type: "image",
      format: "webp",
      url: "https://media.example/first.webp",
      created_at: "2026-01-01",
    };
    const linkedWork = {
      ...firstPageWork,
      _id: "linked-id",
      slug: "linked-work",
      title: "Linked work",
      artist: "Deferred Artist",
    };
    pageMocks.getPublicGalleryReplicationPage.mockResolvedValueOnce({
      items: [firstPageWork],
      cursor: "opaque-next",
      isDone: false,
    });
    pageMocks.getPublicGalleryReplicationBySlug.mockResolvedValueOnce(
      linkedWork,
    );
    pageMocks.getPublicEffects.mockResolvedValueOnce([]);
    pageMocks.getPublicContributorDirectory.mockResolvedValueOnce([]);

    const page = await ReplicationsPage({
      searchParams: Promise.resolve({ viewer: "linked-work" }),
    });
    const explorer = page.props.children[2];

    expect(pageMocks.getPublicGalleryReplicationBySlug).toHaveBeenCalledWith(
      "linked-work",
    );
    expect(explorer.props.replications).toEqual([firstPageWork, linkedWork]);
  });
});
