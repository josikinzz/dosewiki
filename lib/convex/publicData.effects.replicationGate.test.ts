import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryReplication } from "../../src/types/replications";
import type { PublicDataReadAdapter } from "./publicData.reads";
import { projectPublicApiReplication } from "../public-api/v1";

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

  it("keeps a figure out of an effect's article gallery and its permalink walk", async () => {
    const replication = row({ slug: "tracers-study", effect_slug: "tracers" });
    const figure = row({ slug: "ecg-trace", effect_slug: "tracers", role: "figure" });

    const { getPublicReplicationsByEffect } = await loadWithRows([replication, figure]);

    expect((await getPublicReplicationsByEffect("tracers")).map((item) => item.slug)).toEqual([
      "tracers-study",
    ]);
  });

  it("hydrates exact tag-only associations with full public rights, without duplicates or inherited matches", async () => {
    const tagged = row({
      slug: "deliriant-work", effect_slug: "external-hallucination",
      effect_tags: ["delirium"], rights_status: "permission-granted",
      license_name: "Artist permission", license_url: "https://artist.test/terms",
      credit_line: "Artist, used with permission", rightsholder: "Artist",
      source_url: "https://artist.test/original", permission_notes: "Private grant",
    });
    const owner = row({ slug: "owning-work", effect_slug: "delirium", effect_tags: ["delirium"] });
    const noOwner = row({ slug: "tag-without-owner", effect_slug: undefined, effect_tags: ["delirium"] });
    const unrelated = row({ slug: "untagged-child", effect_slug: "internal-hallucination" });
    const suppressed = row({ slug: "suppressed", effect_tags: ["delirium"], publication_state: "duplicate-suppressed" });
    const stale = row({ slug: "stale-tag", effect_tags: ["delirium"] });
    const withdrawn = row({ slug: "withdrawn", effect_tags: ["delirium"] });
    // The discovery projection intentionally has no rights/source detail.
    const slimTagged = row({ slug: tagged.slug, effect_slug: tagged.effect_slug, effect_tags: tagged.effect_tags });
    const { getPublicReplicationsByEffect } = await loadWithRows(
      [slimTagged, owner, noOwner, unrelated, suppressed, slimTagged, stale, withdrawn],
      [owner, tagged, noOwner, unrelated, suppressed, { ...stale, effect_tags: [] }, { ...withdrawn, role: "figure" }],
    );
    const result = (await getPublicReplicationsByEffect("delirium")).map(projectPublicApiReplication);
    expect(result.map((item) => item.slug)).toEqual(["deliriant-work", "owning-work", "tag-without-owner"]);
    expect(result[0]).toMatchObject({
      effect_slug: "external-hallucination", effect_tags: ["delirium"],
      rights: {
        status: "permission-granted", license_name: "Artist permission",
        license_url: "https://artist.test/terms", credit_line: "Artist, used with permission",
        source_url: "https://artist.test/original", rightsholder: "Artist",
      },
    });
    expect(result[0]).not.toHaveProperty("permission_notes");
    expect(result[1].rights.status).toBe("unknown");
    expect((await getPublicReplicationsByEffect("external-hallucination")).map((item) => item.slug)).toEqual(["deliriant-work"]);
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
