import { describe, expect, it } from "vitest";
import type { ReplicationWithUrl } from "@/types/replications";
import { orderEffectReplications } from "@/features/effects/gallery/replicationDetailModel";
import { replicationMediaRank, sortByMediaRank } from "./mediaRank";

describe("replicationMediaRank", () => {
  it("puts a video with confirmed audible signal first", () => {
    expect(replicationMediaRank({ type: "video", format: "mp4", has_audio: true })).toBe(0);
  });

  it("treats silent and unprobed videos as motion, not audio-first", () => {
    // Absent means "never probed": an unprobed video must not be promoted on
    // hope, so only an explicit `true` earns rank 0.
    expect(replicationMediaRank({ type: "video", format: "mp4", has_audio: false })).toBe(1);
    expect(replicationMediaRank({ type: "video", format: "mp4" })).toBe(1);
    expect(replicationMediaRank({ type: "video", format: "mp4", has_audio: null })).toBe(1);
  });

  it("rides GIF-format loops with the silent motion tier, case-insensitively", () => {
    expect(replicationMediaRank({ type: "image", format: "gif" })).toBe(1);
    expect(replicationMediaRank({ type: "image", format: "GIF" })).toBe(1);
  });

  it("sinks stills and unrenderable rows last", () => {
    expect(replicationMediaRank({ type: "image", format: "webp" })).toBe(2);
    expect(replicationMediaRank({ type: "audio", format: "mp3" })).toBe(2);
  });

  it("never lets has_audio promote a non-video", () => {
    // An audio row with a track is still not a video playlist opener.
    expect(replicationMediaRank({ type: "audio", format: "mp3", has_audio: true })).toBe(2);
    expect(replicationMediaRank({ type: "image", format: "gif", has_audio: true })).toBe(1);
  });
});

describe("sortByMediaRank", () => {
  const work = (slug: string, media: { type: string; format: string; has_audio?: boolean }) => ({
    slug,
    media,
  });

  it("sorts by rank alone and keeps the incoming order within each rank", () => {
    const items = [
      work("still-1", { type: "image", format: "jpg" }),
      work("silent-video", { type: "video", format: "mp4" }),
      work("sounded-2", { type: "video", format: "mp4", has_audio: true }),
      work("gif-loop", { type: "image", format: "gif" }),
      work("sounded-1", { type: "video", format: "mp4", has_audio: true }),
      work("still-2", { type: "image", format: "webp" }),
    ];

    expect(sortByMediaRank(items, (item) => item.media).map((item) => item.slug)).toEqual([
      // Sounded videos in arrival order, then motion (silent video before the
      // GIF only because it arrived first), then stills in arrival order.
      "sounded-2",
      "sounded-1",
      "silent-video",
      "gif-loop",
      "still-1",
      "still-2",
    ]);
  });

  it("does not mutate the input", () => {
    const items = [
      work("still", { type: "image", format: "jpg" }),
      work("sounded", { type: "video", format: "mp4", has_audio: true }),
    ];
    sortByMediaRank(items, (item) => item.media);
    expect(items.map((item) => item.slug)).toEqual(["still", "sounded"]);
  });
});

describe("orderEffectReplications applies the rank as primary key", () => {
  const base: ReplicationWithUrl = {
    _id: "id-0",
    _creationTime: 0,
    slug: "slug-0",
    title: "Title",
    artist: "Chelsea Morgan",
    type: "image",
    storage_id: "storage-0",
    effect_slug: "tracers",
    format: "webp",
    created_at: "2024-01-01T00:00:00.000Z",
    url: "https://cdn.test/0.webp",
  };
  const make = (overrides: Partial<ReplicationWithUrl>): ReplicationWithUrl => ({
    ...base,
    ...overrides,
  });

  it("keeps an explicit gallery_order ahead of automatic media ranks", () => {
    const items = [
      make({ slug: "curated-still" }),
      make({ slug: "sounded", type: "video", format: "mp4", has_audio: true }),
      make({ slug: "silent", type: "video", format: "mp4" }),
    ];

    // The editor's exact prefix is authoritative. Automatic media rank only
    // determines where the unlisted sounded work lands after that prefix.
    expect(
      orderEffectReplications(items, ["curated-still", "silent"]).map(
        (item) => item.slug,
      ),
    ).toEqual(["curated-still", "silent", "sounded"]);
  });

  it("keeps the curated order within a rank", () => {
    const items = [
      make({ slug: "b", type: "video", format: "mp4", has_audio: true }),
      make({ slug: "a", type: "video", format: "mp4", has_audio: true }),
      make({ slug: "uncurated", type: "video", format: "mp4", has_audio: true, created_at: "2020-01-01T00:00:00.000Z" }),
    ];

    expect(orderEffectReplications(items, ["a", "b"]).map((item) => item.slug)).toEqual([
      "a",
      "b",
      "uncurated",
    ]);
  });
});
