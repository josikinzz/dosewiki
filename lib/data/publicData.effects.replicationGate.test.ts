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

/**
 * The publication gate on the replication reads.
 *
 * These two helpers plus `getReplicationsByContributor` are the whole public
 * replication call graph, so a row they withhold is withheld from every surface
 * at once. Each case below is named for the surfaces it protects rather than for
 * the helper it calls, because that mapping is the actual claim:
 *
 *   getPublicReplications        → gallery explorer (spotlight, rails, tiles,
 *                                  "N works · N artists · N effects"), Effect
 *                                  Index homepage panel, the public route plan
 *                                  and therefore `generateStaticParams` and the
 *                                  sitemap, `/api/v1/replications[/slug]`, and
 *                                  the About page's contributor credit counts.
 *   getPublicReplicationsByEffect → the effect article's Replications section,
 *                                  `/api/v1/effects/[slug]/replications`, and
 *                                  the permalink's prev/next effect walk.
 *
 * The permalink itself reads a single row and gates it in `loadReplicationRoute`
 * — covered in `lib/next/routeLoaders.test.tsx`.
 */

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

// Module reloads isolate the adapter singleton and request caches between cases;
// static imports would retain the previous case's configured adapter.
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

  it("keeps a figure off every surface that reads the cross-effect gallery", async () => {
    const replication = row({ slug: "tree-bark", role: "replication" });
    const figure = row({ slug: "vertebral-column-diagram", role: "figure" });

    const { getPublicReplications } = await loadWithRows([replication, figure]);

    expect((await getPublicReplications()).map((item) => item.slug)).toEqual(["tree-bark"]);
  });

  it("withholds only explicit non-replications while preserving unresolved rows", async () => {
    const confirmed = row({ slug: "confirmed", replication_status: "replication" });
    const nonReplication = row({ slug: "diagram", replication_status: "not-replication" });
    const unreviewed = row({ slug: "pending", replication_status: "unreviewed" });
    const unclear = row({ slug: "unclear", replication_status: "unclear" });
    const legacy = row({ slug: "legacy" });

    const { getPublicReplications } = await loadWithRows([
      confirmed,
      nonReplication,
      unreviewed,
      unclear,
      legacy,
    ]);

    expect((await getPublicReplications()).map((item) => item.slug)).toEqual([
      "confirmed",
      "pending",
      "unclear",
      "legacy",
    ]);
  });

  it("withholds a reversibly duplicate-suppressed row without changing its taxonomy", async () => {
    const keeper = row({ slug: "original-keeper", replication_status: "replication" });
    const duplicate = row({
      slug: "reddit-copy",
      replication_status: "replication",
      publication_state: "duplicate-suppressed",
      duplicate_of_replication_id: keeper._id,
    });

    const { getPublicReplications, getPublicReplicationsByEffect } = await loadWithRows([
      keeper,
      duplicate,
    ]);

    expect((await getPublicReplications()).map((item) => item.slug)).toEqual(["original-keeper"]);
    expect((await getPublicReplicationsByEffect("geometry")).map((item) => item.slug)).toEqual([
      "original-keeper",
    ]);
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
