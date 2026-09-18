import { describe, expect, it } from "vitest";
import type { ShowcaseWork } from "../components/showcaseWork";
import { moveViewerGroup, moveViewerWork, type ReplicationViewerPosition } from "../viewer/viewerModel";
import { buildEmbedCollection } from "./embedModel";

function work(slug: string, effectSlug: string, type: "image" | "video" = "image"): ShowcaseWork {
  return {
    slug, title: slug, type, url: `https://media.example/${slug}`,
    byline: "Creator unknown", artistName: null, artistHref: null,
    artistHrefExternal: false, effectSlug, effectName: effectSlug,
  };
}

describe("publisher playlist order", () => {
  it("walks each curated order without sorting or deleting a shared work from another effect", () => {
    const embedded = buildEmbedCollection(
      { kind: "effect", slugs: ["tracers", "drifting"] },
      [
        { slug: "tracers", label: "Tracers", works: [work("z-pinned-still", "tracers"), work("shared-motion", "tracers", "video"), work("a-last", "tracers")] },
        { slug: "drifting", label: "Drifting", works: [work("other-pin", "drifting"), work("shared-motion", "drifting", "video")] },
      ],
      "/embed/replications?kind=effect&slug=tracers&slug=drifting",
    );
    const walked: string[][] = [];
    let group: ReplicationViewerPosition | null = { groupIndex: 0, itemIndex: 0 };
    while (group) {
      const order: string[] = [];
      let position: ReplicationViewerPosition | null = group;
      while (position) {
        const item = embedded.viewer.groups[position.groupIndex].items[position.itemIndex];
        order.push(`${item.effectSlug}:${item.replication.slug}`);
        position = moveViewerWork(embedded.viewer, position, 1);
      }
      walked.push(order);
      group = moveViewerGroup(embedded.viewer, group, 1);
    }
    expect(walked).toEqual([
      ["tracers:z-pinned-still", "tracers:shared-motion", "tracers:a-last"],
      ["drifting:other-pin", "drifting:shared-motion"],
    ]);
    // The compact showcase spreads across effects: one work per group per round.
    expect(embedded.works.map((item) => item.slug)).toEqual([
      "z-pinned-still", "other-pin", "shared-motion", "a-last",
    ]);
  });
});
