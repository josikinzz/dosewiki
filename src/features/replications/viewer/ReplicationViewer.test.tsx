import { describe, expect, it } from "vitest";
import type { ReplicationWithUrl } from "@/types/replications";
import {
  FALLBACK_IMAGE_RATIO,
  FALLBACK_VIDEO_RATIO,
  buildViewerPath,
  parseViewerSetParam,
  resolveMediaAspect,
  shouldLoopReplicationMotion,
  viewerDocumentTitle,
} from "./viewerLogic";
import type { ReplicationViewerItem } from "./viewerModel";

describe("resolveMediaAspect", () => {
  it("prefers a probed ratio over catalogued dimensions", () => {
    expect(resolveMediaAspect("video", 1600, 900, 4 / 3)).toBeCloseTo(
      4 / 3,
      10,
    );
  });

  it("falls back to catalogued dimensions when nothing was probed", () => {
    expect(resolveMediaAspect("image", 1200, 1600, undefined)).toBeCloseTo(
      3 / 4,
      10,
    );
  });

  it("guesses by type when the row carries no dimensions", () => {
    expect(resolveMediaAspect("video", undefined, undefined, undefined)).toBe(
      FALLBACK_VIDEO_RATIO,
    );
    expect(resolveMediaAspect("image", null, null, undefined)).toBe(
      FALLBACK_IMAGE_RATIO,
    );
  });

  it("ignores junk probes and junk dimensions", () => {
    expect(resolveMediaAspect("image", 1600, 900, Number.NaN)).toBeCloseTo(
      16 / 9,
      10,
    );
    expect(resolveMediaAspect("image", 1600, 900, 0)).toBeCloseTo(16 / 9, 10);
    expect(resolveMediaAspect("video", 0, 900, undefined)).toBe(
      FALLBACK_VIDEO_RATIO,
    );
  });
});

describe("parseViewerSetParam", () => {
  it("parses each scope the grammar knows", () => {
    expect(parseViewerSetParam("?set=effect:tracers")).toEqual({
      kind: "effect",
      slug: "tracers",
    });
    expect(parseViewerSetParam("?set=substance:lsd")).toEqual({
      kind: "substance",
      slug: "lsd",
    });
    expect(parseViewerSetParam("?set=artist:chelsea-morgan")).toEqual({
      kind: "artist",
      slug: "chelsea-morgan",
    });
  });

  it("parses the Unattributed bucket's artist keys", () => {
    expect(parseViewerSetParam("?set=artist:unknown")).toEqual({
      kind: "artist",
      slug: "unknown",
    });
    expect(parseViewerSetParam("?set=artist:unknown-1a2b3c")).toEqual({
      kind: "artist",
      slug: "unknown-1a2b3c",
    });
  });

  it("parses multi-segment slugs and ignores unrelated params", () => {
    expect(parseViewerSetParam("?foo=bar&set=substance:4-ho-met")).toEqual({
      kind: "substance",
      slug: "4-ho-met",
    });
  });

  it("accepts a URL-encoded colon, which browsers may normalise either way", () => {
    expect(parseViewerSetParam("?set=substance%3Alsd")).toEqual({
      kind: "substance",
      slug: "lsd",
    });
  });

  it("returns null when the param is absent", () => {
    expect(parseViewerSetParam("")).toBeNull();
    expect(parseViewerSetParam("?foo=bar")).toBeNull();
  });

  it("rejects unknown scope kinds", () => {
    expect(parseViewerSetParam("?set=playlist:favourites")).toBeNull();
  });

  it("rejects values outside the slug charset — they feed a fetch path", () => {
    expect(parseViewerSetParam("?set=substance:")).toBeNull();
    expect(parseViewerSetParam("?set=substance:../../etc")).toBeNull();
    expect(parseViewerSetParam("?set=substance:LSD")).toBeNull();
    expect(parseViewerSetParam("?set=substance:lsd?x=1")).toBeNull();
    expect(parseViewerSetParam("?set=substance:-lsd")).toBeNull();
    expect(parseViewerSetParam("?set=artist:Chelsea Morgan")).toBeNull();
  });
});

describe("buildViewerPath", () => {
  it("builds the canonical permalink when no scope is live", () => {
    expect(buildViewerPath("tracers-chelsea-morgan", null)).toBe(
      "/replications/tracers-chelsea-morgan",
    );
  });

  it("carries the scope param so a copied URL reproduces the walk", () => {
    expect(
      buildViewerPath("tracers-chelsea-morgan", {
        kind: "effect",
        slug: "tracers",
      }),
    ).toBe("/replications/tracers-chelsea-morgan?set=effect:tracers");
    expect(
      buildViewerPath("tracers-chelsea-morgan", {
        kind: "substance",
        slug: "lsd",
      }),
    ).toBe("/replications/tracers-chelsea-morgan?set=substance:lsd");
    expect(
      buildViewerPath("tracers-chelsea-morgan", {
        kind: "artist",
        slug: "chelsea-morgan",
      }),
    ).toBe("/replications/tracers-chelsea-morgan?set=artist:chelsea-morgan");
  });

  it("round-trips every scope kind through the parser", () => {
    for (const param of [
      { kind: "effect" as const, slug: "tracers" },
      { kind: "substance" as const, slug: "4-ho-met" },
      { kind: "artist" as const, slug: "unknown" },
    ]) {
      const path = buildViewerPath("slug", param);
      expect(parseViewerSetParam(path.slice(path.indexOf("?")))).toEqual(param);
    }
  });
});

describe("shouldLoopReplicationMotion", () => {
  it("loops GIF-like motion regardless of recorded duration", () => {
    expect(shouldLoopReplicationMotion("gif", 120)).toBe(true);
    expect(shouldLoopReplicationMotion("GIF", undefined)).toBe(true);
  });

  it("loops ordinary motion only below sixty seconds", () => {
    expect(shouldLoopReplicationMotion("mp4", 59.999)).toBe(true);
    expect(shouldLoopReplicationMotion("mp4", 60)).toBe(false);
    expect(shouldLoopReplicationMotion("mp4", 600)).toBe(false);
    expect(shouldLoopReplicationMotion("mp4", undefined)).toBe(false);
  });
});

describe("viewerDocumentTitle", () => {
  const replication = {
    title: "Tracers",
    artist: "Chelsea Morgan",
  } as ReplicationWithUrl;

  const item = (
    overrides: Partial<ReplicationWithUrl>,
  ): ReplicationViewerItem => ({
    replication: { ...replication, ...overrides } as ReplicationWithUrl,
    effectName: null,
    effectSlug: null,
    effectCategories: [],
    artistProfileHref: null,
    avatarUrl: null,
  });

  it("matches the server metadata title for a credited work", () => {
    expect(viewerDocumentTitle(item({}))).toBe("Tracers by Chelsea Morgan");
  });

  it("drops the byline for unattributed works, like the server does", () => {
    expect(viewerDocumentTitle(item({ artist: "Unknown" }))).toBe("Tracers");
  });
});
