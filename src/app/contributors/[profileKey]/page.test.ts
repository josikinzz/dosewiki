import { describe, expect, it, vi } from "vitest";
import type * as SiteFlavorModule from "@/config/siteFlavor";

const mocks = vi.hoisted(() => ({
  loadContributorRoute: vi.fn(),
}));
vi.mock("@/config/siteFlavor", async (importOriginal) => {
  const actual = await importOriginal<typeof SiteFlavorModule>();
  return {
    ...actual,
    SITE_FLAVOR_CONFIG: actual.SITE_FLAVOR_CONFIGS.dosewiki,
    isEffectIndex: (config = actual.SITE_FLAVOR_CONFIGS.dosewiki) =>
      actual.isEffectIndex(config),
  };
});


vi.mock("@server/next/routeLoaders.contributors", () => ({
  loadContributorRoute: mocks.loadContributorRoute,
}));
vi.mock("@/components/pages/UserProfilePage", () => ({
  UserProfilePage: () => null,
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
      replications: {},
      reports: {},
      contributors: {
        ada: "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/ab/abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789.jpg",
      },
    },
  },
}));

import { generateMetadata } from "./page";

describe("contributor social metadata", () => {
  it("uses the canonical profile card for an alias that forwards to an artist page", async () => {
    mocks.loadContributorRoute.mockResolvedValueOnce({
      kind: "redirect",
      target: "/replications/artist/ada",
      metadata: {
        title: "Ada",
        description: "Ada creates visual subjective-effect replications.",
      },
      canonicalRoute: {
        family: "replicationArtist",
        params: { key: "ada" },
      },
      socialCardProfileKey: "ADA",
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ profileKey: "old-ada-handle" }),
    });
    const cardUrl =
      "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/ab/abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789.jpg";

    expect(metadata.alternates?.canonical).toBe(
      "https://dose.wiki/replications/artist/ada",
    );
    expect(metadata.openGraph?.images).toEqual([
      {
        url: cardUrl,
        width: 1200,
        height: 1200,
        alt: "Ada contributor profile card",
      },
    ]);
    expect(metadata.twitter?.images).toEqual([cardUrl]);
  });

  it("uses the publication fallback when no contributor entity exists", async () => {
    mocks.loadContributorRoute.mockResolvedValueOnce({
      kind: "not-found",
      normalizedKey: "MISSING",
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ profileKey: "missing" }),
    });

    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://dose.wiki/icon-512.png",
        width: 512,
        height: 512,
        alt: "dose.wiki logo",
      },
    ]);
    expect(metadata.twitter?.images).toEqual([
      "https://dose.wiki/icon-512.png",
    ]);
  });
});
