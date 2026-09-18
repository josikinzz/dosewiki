import { describe, expect, it } from "vitest";
import type { ReplicationWithUrl } from "@/types/replications";
import {
  findViewerPosition,
  moveViewerGroup,
  moveViewerWork,
  type ReplicationViewerCollection,
  type ReplicationViewerItem,
} from "./viewerModel";

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

// Full items keep navigation tests representative without testing metadata.
const toItem = (replication: ReplicationWithUrl): ReplicationViewerItem => ({
  replication,
  effectName: null,
  effectSlug: null,
  effectCategories: [],
  artistProfileHref: null,
  avatarUrl: null,
});

describe("normalized viewer collections", () => {
  const collection: ReplicationViewerCollection = {
    sourcePath: "/replications?view=effect",
    label: "Effects",
    kind: "gallery",
    grouping: "effect",
    groups: [
      {
        key: "tracers",
        label: "Tracers",
        items: [
          toItem(make({ slug: "tracers-a" })),
          toItem(make({ slug: "tracers-b" })),
        ],
      },
      {
        key: "drifting",
        label: "Drifting",
        items: [
          toItem(make({ slug: "drifting-a" })),
          toItem(make({ slug: "drifting-b" })),
        ],
      },
    ],
  };

  it("locates a work by group and item index", () => {
    expect(findViewerPosition(collection, "drifting-b")).toEqual({
      groupIndex: 1,
      itemIndex: 1,
    });
    expect(findViewerPosition(collection, "absent")).toBeNull();
  });

  it("moves horizontally only inside the active group and stops at its ends", () => {
    expect(
      moveViewerWork(collection, { groupIndex: 0, itemIndex: 0 }, 1),
    ).toEqual({
      groupIndex: 0,
      itemIndex: 1,
    });
    expect(
      moveViewerWork(collection, { groupIndex: 0, itemIndex: 1 }, 1),
    ).toBeNull();
    expect(
      moveViewerWork(collection, { groupIndex: 0, itemIndex: 0 }, -1),
    ).toBeNull();
  });

  it("moves vertically to the remembered work in the destination group", () => {
    expect(
      moveViewerGroup(collection, { groupIndex: 0, itemIndex: 1 }, 1, {
        drifting: "drifting-b",
      }),
    ).toEqual({ groupIndex: 1, itemIndex: 1 });
    expect(
      moveViewerGroup(collection, { groupIndex: 1, itemIndex: 1 }, -1),
    ).toEqual({
      groupIndex: 0,
      itemIndex: 0,
    });
    expect(
      moveViewerGroup(collection, { groupIndex: 1, itemIndex: 0 }, 1),
    ).toBeNull();
  });
});
