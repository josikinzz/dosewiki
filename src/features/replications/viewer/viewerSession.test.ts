import { describe, expect, it } from "vitest";

import type { ReplicationViewerCollection } from "./viewerModel";
import {
  createViewerSession,
  type ViewerHistoryAdapter,
  type ViewerSessionSnapshot,
} from "./viewerSession";

function item(slug: string) {
  return {
    replication: {
      slug,
      title: slug,
      artist: "Artist",
      type: "image" as const,
      format: "jpg",
      url: `/${slug}.jpg`,
    },
    effectName: null,
    effectSlug: null,
    effectCategories: [],
    artistProfileHref: null,
    avatarUrl: null,
  };
}

function collection(
  groups: ReadonlyArray<{ key: string; slugs: string[] }>,
  grouping: "artist" | "effect" = "artist",
): ReplicationViewerCollection {
  return {
    sourcePath: "/replications",
    label: "Works",
    kind: "gallery",
    grouping,
    groups: groups.map((group) => ({
      key: group.key,
      label: group.key,
      items: group.slugs.map(item),
    })),
  };
}

function setup(sourceCollection = collection([{ key: "a", slugs: ["a1", "a2"] }])) {
  const pushes: string[] = [];
  const replaces: string[] = [];
  let backs = 0;
  let active = false;
  const changes: ViewerSessionSnapshot[] = [];
  const history: ViewerHistoryAdapter = {
    push: (url) => pushes.push(url),
    replace: (url) => replaces.push(url),
    back: () => {
      backs += 1;
    },
    viewerStateActive: () => active,
  };
  const session = createViewerSession({
    collection: sourceCollection,
    initialSlug: sourceCollection.groups[0]?.items[0]?.replication.slug ?? "",
    history,
    buildUrl: (source, slug) => `${source}?viewer=${slug}`,
    closeUrl: () => "/closed",
    currentSource: () => "/source",
    onChange: (snapshot) => changes.push(snapshot),
  });
  return {
    session,
    pushes,
    replaces,
    changes,
    setActive(value: boolean) {
      active = value;
    },
    backs: () => backs,
  };
}

describe("createViewerSession", () => {
  it("opens with a pushed URL and walks works with horizontal motion", () => {
    const state = setup();
    state.session.open("a2", "fade");
    expect(state.pushes).toEqual(["/source?viewer=a2"]);
    expect(state.session.snapshot()).toEqual({
      position: { groupIndex: 0, itemIndex: 1 },
      entry: "fade",
    });
    state.session.commitWork(-1);
    expect(state.replaces).toEqual(["/source?viewer=a1"]);
    expect(state.session.snapshot().entry).toBeNull();
  });

  it("prepares the remembered group destination without navigating early", () => {
    const state = setup(
      collection([
        { key: "a", slugs: ["a1", "a2"] },
        { key: "b", slugs: ["b1", "b2"] },
      ]),
    );
    state.session.open("a2");
    expect(state.session.adjacentGroup(1)).toEqual({ groupIndex: 1, itemIndex: 0 });
    expect(state.session.snapshot().position).toEqual({ groupIndex: 0, itemIndex: 1 });
    expect(state.session.adjacentGroup(-1)).toBeNull();
    state.session.commitGroup(1);
    expect(state.session.snapshot()).toEqual({
      position: { groupIndex: 1, itemIndex: 0 },
      entry: null,
    });
    state.session.commitWork(1);
    expect(state.session.adjacentGroup(-1)).toEqual({ groupIndex: 0, itemIndex: 1 });
    state.session.commitGroup(-1);
    expect(state.session.snapshot()).toEqual({
      position: { groupIndex: 0, itemIndex: 1 },
      entry: null,
    });
    state.session.commitGroup(1);
    expect(state.session.snapshot().position).toEqual({ groupIndex: 1, itemIndex: 1 });
  });

  it("regroups on the active work with a fade", () => {
    const state = setup();
    state.session.regroup("effect", "a2");
    expect(state.session.snapshot()).toEqual({
      position: { groupIndex: 0, itemIndex: 1 },
      entry: "fade",
    });
  });

  it("applies editor order while keeping the active work selected", () => {
    const state = setup(collection([{ key: "a", slugs: ["a1", "a2", "a3"] }]));
    state.session.open("a2");
    state.session.applyOrder(["a3", "a2", "a1"]);
    expect(state.session.snapshot()).toEqual({
      position: { groupIndex: 0, itemIndex: 1 },
      entry: "fade",
    });
    state.session.commitWork(-1);
    expect(state.replaces[state.replaces.length - 1]).toBe("/source?viewer=a3");
  });

  it("adopts an expanded reordered collection without history or losing group memory", () => {
    const state = setup(
      collection([
        { key: "a", slugs: ["a1", "a2"] },
        { key: "b", slugs: ["b1", "b2"] },
      ]),
    );
    state.session.syncFromUrl("b2");
    state.session.syncFromUrl("a2");
    const historyBefore = {
      pushes: state.pushes.length,
      replaces: state.replaces.length,
    };

    state.session.setCollection(
      collection([
        { key: "b", slugs: ["b3", "b1", "b2"] },
        { key: "a", slugs: ["a3", "a2", "a1"] },
        { key: "c", slugs: ["c1"] },
      ]),
    );

    expect(state.session.snapshot()).toEqual({
      position: { groupIndex: 1, itemIndex: 1 },
      entry: null,
    });
    expect(state.session.adjacentGroup(-1)).toEqual({
      groupIndex: 0,
      itemIndex: 2,
    });
    expect(state.pushes).toHaveLength(historyBefore.pushes);
    expect(state.replaces).toHaveLength(historyBefore.replaces);
  });

  it("backs from viewer history and otherwise replaces the closed URL", () => {
    const state = setup();
    state.setActive(true);
    state.session.close();
    expect(state.backs()).toBe(1);
    state.setActive(false);
    state.session.close();
    expect(state.replaces).toEqual(["/closed"]);
  });
});
