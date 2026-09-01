import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadReplicationRoute: vi.fn(),
}));

vi.mock("@server/next/routeLoaders.replications", () => ({
  loadReplicationRoute: mocks.loadReplicationRoute,
}));
vi.mock("@/features/effects/pages/ReplicationDetailPage", () => ({
  ReplicationDetailPage: () => null,
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
        "canonical-work":
          "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/cd/cdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab.jpg",
      },
      reports: {},
      contributors: {},
    },
  },
}));

import { generateMetadata } from "./page";

describe("replication detail social metadata", () => {
  it("uses the canonical replication card for a resolved detail page", async () => {
    mocks.loadReplicationRoute.mockResolvedValueOnce({
      kind: "ok",
      metadata: {
        title: "Canonical Work",
        description: "A visual subjective-effect replication.",
      },
      canonicalRoute: {
        family: "replication",
        params: { slug: "canonical-work" },
      },
      pageProps: {
        replication: {
          slug: "canonical-work",
          title: "Canonical Work",
        },
      },
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "retired-work-slug" }),
    });
    const cardUrl =
      "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/cd/cdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab.jpg";

    expect(metadata.alternates?.canonical).toBe(
      "https://dose.wiki/replications/canonical-work",
    );
    expect(metadata.openGraph?.images).toEqual([
      {
        url: cardUrl,
        width: 1200,
        height: 1200,
        alt: "Canonical Work replication card",
      },
    ]);
    expect(metadata.twitter?.images).toEqual([cardUrl]);
  });
});
