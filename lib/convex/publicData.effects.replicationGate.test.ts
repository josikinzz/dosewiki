import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryReplication, ReplicationWithUrl } from "../../src/types/replications";
import type { PublicDataReadAdapter } from "./publicData.reads";

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

async function loadWithRows(rows: GalleryReplication[]) {
  vi.resetModules();

  const reads = await import("./publicData.reads");
  reads.setPublicDataReadAdapterForTest({
    getPublicReplications: async () => rows,
    getPublicReplicationsByEffect: async (effectSlug: string) =>
      rows.filter((item) => item.effect_slug === effectSlug) as ReplicationWithUrl[],
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

  it("keeps a figure out of an effect's article gallery and its permalink walk", async () => {
    const replication = row({ slug: "tracers-study", effect_slug: "tracers" });
    const figure = row({ slug: "ecg-trace", effect_slug: "tracers", role: "figure" });

    const { getPublicReplicationsByEffect } = await loadWithRows([replication, figure]);

    expect((await getPublicReplicationsByEffect("tracers")).map((item) => item.slug)).toEqual([
      "tracers-study",
    ]);
  });

  it("withholds audio, which every surface would otherwise draw as an image", async () => {
    const image = row({ slug: "a-picture", type: "image" });
    const audio = row({ slug: "a-recording", type: "audio", format: "mp3" });

    const { getPublicReplications, getPublicReplicationsByEffect } = await loadWithRows([
      image,
      audio,
    ]);

    expect((await getPublicReplications()).map((item) => item.slug)).toEqual(["a-picture"]);
    expect((await getPublicReplicationsByEffect("geometry")).map((item) => item.slug)).toEqual([
      "a-picture",
    ]);
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

  it("passes the stored corpus through untouched", async () => {
    // A read-only audit of production on 2026-08-11 found 247 rows: every one
    // with `role` absent, every one `image` or `video`, every one carrying an
    // `effect_slug`. This is that shape, and the gate has to be the identity on
    // it — the change may not move a single existing work.
    const corpus = [
      row({ slug: "legacy-image", type: "image" }),
      row({ slug: "legacy-video", type: "video", effect_slug: "drifting" }),
      row({ slug: "legacy-unknown-effect", type: "image", effect_slug: "unknown" }),
    ];
    for (const item of corpus) {
      expect(item.role).toBeUndefined();
    }

    const { getPublicReplications } = await loadWithRows(corpus);

    expect(await getPublicReplications()).toEqual(corpus);
  });
});
