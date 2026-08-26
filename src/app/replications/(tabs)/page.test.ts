import { PUBLIC_SITE } from "@server/next/publicSite";
import { describe, expect, it, vi } from "vitest";

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
  ReplicationsGalleryExplorer: () => null,
}));
vi.mock("@/features/replications/components/ReplicationsTabNav", () => ({
  ReplicationsTabNav: () => null,
}));

import { generateMetadata } from "./page";

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
