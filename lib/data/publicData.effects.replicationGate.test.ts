import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryReplication } from "../../src/types/replications";
import type { PublicDataReadAdapter } from "./publicData.reads";

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://localhost/dosewiki_test");
  vi.stubEnv("POSTGRES_DIRECT_URL", undefined);
  vi.stubEnv("TARGET_POSTGRES_URL", undefined);
});
afterEach(() => vi.unstubAllEnvs());

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

let seq = 0;

function row(overrides: Partial<GalleryReplication> = {}): GalleryReplication {
  seq += 1;
  return {
    _id: `id-${seq}`,
    _creationTime: seq,
    slug: `slug-${seq}`,
    title: `Work ${seq}`,
    artist: "Josie Kins",
    type: "image",
    storage_id: `storage-${seq}`,
    effect_slug: "geometry",
    format: "jpg",
    created_at: "2024-01-01T00:00:00.000Z",
    url: `https://cdn.test/${seq}.jpg`,
    ...overrides,
  };
}

async function loadWithRows(rows: GalleryReplication[], details = rows) {
  vi.resetModules();

  const reads = await import("./publicData.reads");
  reads.setPublicDataReadAdapterForTest({
    getPublicGalleryReplicationPage: async () => ({
      items: rows,
      cursor: "done",
      isDone: true,
    }),
    getPublicReplicationsBySlugs: async (slugs: string[]) =>
      details.filter((item) => slugs.includes(item.slug)),
  } as unknown as PublicDataReadAdapter);

  return await import("./publicData.effects");
}

describe("the replication publication gate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("withholds an unpublished studio upload until its provenance is complete and it publishes", async () => {
    const live = row({ slug: "live-work" });
    const held = row({ slug: "fresh-upload", publication_state: "unpublished", rights_status: "unknown" });
    const published = row({ slug: "published-upload", publication_state: "published", source_url: "https://artist.test/work" });

    const { getPublicReplications, getPublicReplicationsByEffect } = await loadWithRows([live, held, published]);

    expect((await getPublicReplications()).map((item) => item.slug)).toEqual(["live-work", "published-upload"]);
    expect((await getPublicReplicationsByEffect("geometry")).map((item) => item.slug)).toEqual([
      "live-work",
      "published-upload",
    ]);
  });
});
