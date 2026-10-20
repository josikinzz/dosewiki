import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSubstanceShowcaseWorks: vi.fn(),
  getPublicReplicationsForSubstance: vi.fn(),
  enforceRateLimit: vi.fn(),
}));
vi.mock("@server/replications/showcaseCollections", () => ({
  getSubstanceShowcaseWorks: mocks.getSubstanceShowcaseWorks,
}));
vi.mock("@server/data/publicData", () => ({
  getPublicReplicationsForSubstance: mocks.getPublicReplicationsForSubstance,
}));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

import { GET } from "./route";

const replication = {
  _id: "private-id", storage_id: "private-storage", permission_notes: "private-notes",
  removal_contact: "private@example.com", title: "A work", artist: "Artist",
  type: "video" as const, effect_slug: "drifting", format: "mp4", created_at: "2026-01-01",
  url: "https://media.example/work.mp4", rights_status: "permission-granted" as const,
  credit_line: "Artist, used with permission", source_url: "https://example.com/source",
  preview_url: "https://media.example/preview.mp4", has_audio: false,
};
const canonicalSlugs = ["work-c", "work-a", "work-d", "work-b", "work-e"];
const gallery = [...canonicalSlugs].reverse().map((slug) => ({
  replication: { ...replication, slug },
  provenance: { matchedVia: "specific_drug", substanceSlug: "ketamine", effectSlug: "drifting" },
}));

function request() {
  return GET(new Request("https://dose.wiki/api/v1/substances/ketamine/replications"), {
    params: Promise.resolve({ slug: "ketamine" }),
  });
}

describe("public substance replication collection", () => {
  beforeEach(() => {
    mocks.getSubstanceShowcaseWorks.mockReset().mockResolvedValue({
      works: canonicalSlugs.map((slug) => ({ slug })),
      collectionLabel: "Ketamine replications",
    });
    mocks.getPublicReplicationsForSubstance.mockReset().mockResolvedValue({ items: gallery });
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  });

  it("preserves public media rights and placement evidence without publishing private records", async () => {
    const body = await (await request()).json();
    expect(body.data[0]).toMatchObject({
      slug: "work-c", preview_url: replication.preview_url, has_audio: false,
      rights: { status: "permission-granted", credit_line: replication.credit_line, source_url: replication.source_url },
      association: { basis: "specific_drug", substance_slug: "ketamine", effect_slug: "drifting" },
    });
    expect(JSON.stringify(body)).not.toContain("private-");
    expect(JSON.stringify(body)).not.toContain("private@example.com");
  });
});
