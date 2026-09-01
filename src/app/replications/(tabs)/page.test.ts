import { PUBLIC_SITE } from "@server/next/publicSite";
import { describe, expect, it, vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  explorer: vi.fn(() => null),
  getPublicGalleryReplications: vi.fn(),
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
  getPublicGalleryReplications: pageMocks.getPublicGalleryReplications,
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

describe("replications prerendered default view", () => {
  it("server-renders the video-first artist rails with complete-corpus stats", async () => {
    const workOf = (index: number, artist: string, type: "image" | "video") => ({
      _id: `work-${index}`,
      slug: `work-${index}`,
      title: `Work ${index}`,
      artist,
      type,
      format: "webp",
      effect_slug: "geometry",
      url: `https://media.example/work-${index}.webp`,
      created_at: "2026-01-01",
    });
    // Prolific image-only artist vs a thinner artist with a video: the
    // default video-first order must put the video artist's rail first.
    const corpus = [
      ...Array.from({ length: 3 }, (_, index) =>
        workOf(index, "Prolific Artist", "image"),
      ),
      workOf(10, "Video Artist", "video"),
    ];
    pageMocks.getPublicGalleryReplications.mockResolvedValueOnce(corpus);
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
    ];
    pageMocks.getPublicContributorDirectory.mockResolvedValueOnce(directory);

    const page = await ReplicationsPage({
      searchParams: Promise.resolve({}),
    });
    const explorer = page.props.children[2];

    expect(pageMocks.getPublicGalleryReplications).toHaveBeenCalledTimes(1);
    expect(explorer.props).toMatchObject({
      completeCorpusUrl: "/api/replications/gallery",
      artistGroupTotal: 2,
      corpusStats: {
        total: 4,
        artists: 2,
        effects: 1,
        images: 3,
        videos: 1,
      },
      contributorDirectory: directory,
    });
    expect(
      explorer.props.initialArtistRails.map(
        ({ label, count }: { label: string; count: number }) => ({
          label,
          count,
        }),
      ),
    ).toEqual([
      { label: "Video Artist", count: 1 },
      { label: "Prolific Artist", count: 3 },
    ]);
    expect(
      explorer.props.replications.map(({ _id }: { _id: string }) => _id),
    ).toEqual(["work-10", "work-0", "work-1", "work-2"]);
  });

  it("caps each prerendered rail at its preview length", async () => {
    const corpus = Array.from({ length: 20 }, (_, index) => ({
      _id: `work-${index}`,
      slug: `work-${index}`,
      title: `Work ${index}`,
      artist: "Prolific Artist",
      type: "image" as const,
      format: "webp",
      url: `https://media.example/work-${index}.webp`,
      created_at: "2026-01-01",
    }));
    pageMocks.getPublicGalleryReplications.mockResolvedValueOnce(corpus);
    pageMocks.getPublicEffects.mockResolvedValueOnce([]);
    pageMocks.getPublicContributorDirectory.mockResolvedValueOnce([]);

    const page = await ReplicationsPage({
      searchParams: Promise.resolve({}),
    });
    const explorer = page.props.children[2];

    expect(explorer.props.replications).toHaveLength(14);
    expect(explorer.props.initialArtistRails).toEqual([
      expect.objectContaining({ label: "Prolific Artist", count: 20 }),
    ]);
  });

  it("server-renders a bounded viewer lookup when the linked work is beyond the prerendered rails", async () => {
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
    pageMocks.getPublicGalleryReplications.mockResolvedValueOnce([
      firstPageWork,
    ]);
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
