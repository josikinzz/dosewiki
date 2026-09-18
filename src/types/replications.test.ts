import { describe, expect, it } from "vitest";
import {
  isPublishableReplication,
  isVisualReplication,
  type ReplicationType,
} from "./replications";

const ALL_REPLICATION_TYPES: readonly ReplicationType[] = [
  "image",
  "video",
  "audio",
];

function row(type: unknown) {
  return { type } as { type: ReplicationType };
}

describe("the presentable media-kind table", () => {
  it("publishes audio alongside image and video", () => {
    for (const type of ALL_REPLICATION_TYPES) {
      expect(isPublishableReplication(row(type))).toBe(true);
    }
  });

  it("still applies every non-kind withholding reason to audio", () => {
    expect(isPublishableReplication({ type: "audio", role: "figure" })).toBe(false);
    expect(
      isPublishableReplication({
        type: "audio",
        replication_status: "not-replication",
      }),
    ).toBe(false);
    expect(
      isPublishableReplication({
        type: "audio",
        publication_state: "duplicate-suppressed",
      }),
    ).toBe(false);
    expect(
      isPublishableReplication({ type: "audio", replication_status: "unreviewed" }),
    ).toBe(true);
  });

  it("withholds unrecognised and prototype-inherited kinds", () => {
    for (const type of [
      undefined,
      null,
      "",
      "pdf",
      3,
      "constructor",
      "toString",
      "hasOwnProperty",
    ]) {
      expect(isPublishableReplication(row(type))).toBe(false);
      expect(isVisualReplication(row(type))).toBe(false);
    }
  });
});

describe("the visual media-kind table", () => {
  it("draws image and video but never audio", () => {
    expect(isVisualReplication(row("image"))).toBe(true);
    expect(isVisualReplication(row("video"))).toBe(true);
    expect(isVisualReplication(row("audio"))).toBe(false);
  });

  it("never draws a kind the publication gate withholds", () => {
    for (const type of ALL_REPLICATION_TYPES) {
      if (isVisualReplication(row(type))) {
        expect(isPublishableReplication(row(type))).toBe(true);
      }
    }
  });

  it("narrows framed rows to image and video", () => {
    const rows: { type: ReplicationType; slug: string }[] = [
      { type: "image", slug: "a-picture" },
      { type: "audio", slug: "a-recording" },
    ];
    const framed = rows.filter(isVisualReplication);
    const kinds: ("image" | "video")[] = framed.map((item) => item.type);

    expect(kinds).toEqual(["image"]);
    expect(framed.map((item) => item.slug)).toEqual(["a-picture"]);
  });
});
