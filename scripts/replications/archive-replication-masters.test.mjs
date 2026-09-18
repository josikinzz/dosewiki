import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RESERVE_BYTES,
  assertArchiveAllowed,
  buildArchivePlan,
  describeRowAssets,
  detectArchiveCollisions,
  hasRoomFor,
  planArchiveBudget,
  summarizeRisk,
} from "./archive-replication-masters.mjs";
import { classifyHostRisk, isProductionUrl, RISK } from "./lib/media-hosts.mjs";
import { assertMediaType, DEFAULT_MEDIA_TYPE, MEDIA_TYPES } from "./lib/media-types.mjs";

const MEDIA_BASE = "https://media.example.test/assets";
const PROD = `${MEDIA_BASE}/media/sha256/${"a".repeat(64)}`;
const ORPHAN = "https://orphan-one.example.invalid/api/storage/x";
const ORPHAN2 = "https://orphan-two.example.invalid/api/storage/x";
const DEV = "https://dev.example.invalid/api/storage/x";

beforeEach(() => vi.stubEnv("REPLICATION_MEDIA_BASE_URL", MEDIA_BASE));
afterEach(() => vi.unstubAllEnvs());

const row = (slug, extra = {}) => ({
  _id: `id-${slug}`,
  slug,
  type: "video",
  format: "mp4",
  url: PROD,
  thumbnail_url: PROD,
  ...extra,
});

describe("classifyHostRisk", () => {
  it("trusts media in the explicitly configured native R2 namespace", () => {
    expect(classifyHostRisk(PROD)).toMatchObject({ risk: RISK.PRODUCTION, atRisk: false });
    expect(isProductionUrl(PROD)).toBe(true);
  });

  it("treats every host outside the configured namespace as at risk", () => {
    expect(classifyHostRisk(ORPHAN)).toMatchObject({ risk: RISK.UNKNOWN, atRisk: true });
    expect(classifyHostRisk(ORPHAN2)).toMatchObject({ risk: RISK.UNKNOWN, atRisk: true });
    expect(classifyHostRisk(DEV)).toMatchObject({ risk: RISK.UNKNOWN, atRisk: true });
  });

  it("treats an unrecognised host as at risk rather than assuming it is fine", () => {
    const result = classifyHostRisk("https://somewhere-nobody-counted.example/x.mp4");

    expect(result.risk).toBe(RISK.UNKNOWN);
    expect(result.atRisk).toBe(true);
  });

  it("does not trust the retired production endpoint or a renamed lookalike", () => {
    for (const host of ["retired.example.invalid", "retired.data.example.invalid"]) {
      const url = `https://${host}/api/storage/x`;
      expect(isProductionUrl(url)).toBe(false);
      expect(classifyHostRisk(url)).toMatchObject({ risk: RISK.UNKNOWN, atRisk: true });
    }
  });

  it("fails closed without a valid explicit media base", () => {
    for (const base of [undefined, "", "not a url", "http://media.example.test/assets", `${MEDIA_BASE}?token=x`]) {
      vi.stubEnv("REPLICATION_MEDIA_BASE_URL", base);
      expect(isProductionUrl(PROD)).toBe(false);
    }
  });

  it("rejects same-host URLs outside the configured namespace and credential-bearing URLs", () => {
    for (const url of [
      `${MEDIA_BASE}/elsewhere/file.mp4`,
      "https://media.example.test/media/sha256/file.mp4",
      PROD.replace("https:", "http:"),
      PROD.replace("https://", "https://user:secret@"),
      `${PROD}?token=x`,
      `${PROD}#fragment`,
    ]) {
      expect(isProductionUrl(url)).toBe(false);
      expect(classifyHostRisk(url).atRisk).toBe(true);
    }
  });

  it("does not crash on a null or malformed url", () => {
    expect(classifyHostRisk(null)).toMatchObject({ host: null, atRisk: true });
    expect(classifyHostRisk("not a url")).toMatchObject({ host: null, atRisk: true });
  });
});

describe("describeRowAssets", () => {
  it("splits a row into its separately-endangered video and poster", () => {
    const assets = describeRowAssets(row("mixed", { url: ORPHAN, thumbnail_url: DEV }));

    expect(assets).toHaveLength(2);
    expect(assets.find((a) => a.kind === "video")).toMatchObject({ risk: RISK.UNKNOWN, atRisk: true });
    expect(assets.find((a) => a.kind === "thumbnail")).toMatchObject({ risk: RISK.UNKNOWN, atRisk: true });
  });

  it("omits an asset the row does not have", () => {
    expect(describeRowAssets(row("no-poster", { thumbnail_url: undefined }))).toHaveLength(1);
  });

  it("files videos and posters into separate directories", () => {
    const assets = describeRowAssets(row("clip"));

    expect(assets.find((a) => a.kind === "video").relativePath).toBe("video/clip.mp4");
    expect(assets.find((a) => a.kind === "thumbnail").relativePath).toBe("poster/clip-poster.jpg");
  });

  it("keeps the source extension when the url carries one", () => {
    const [video] = describeRowAssets(row("clip", { url: `${ORPHAN}/thing.mov`, thumbnail_url: undefined }));

    expect(video.relativePath).toBe("video/clip.mov");
  });

  it("falls back to the row format when the url carries no extension", () => {
    const [video] = describeRowAssets(row("clip", { url: ORPHAN, format: "webm", thumbnail_url: undefined }));

    expect(video.relativePath).toBe("video/clip.webm");
  });
});

describe("media types", () => {
  it("defaults to video, so an invocation written before images still means video", () => {
    expect(DEFAULT_MEDIA_TYPE).toBe("video");
    expect(describeRowAssets(row("clip"))).toEqual(describeRowAssets(row("clip"), "video"));
  });

  it("refuses a media type the corpus does not have", () => {
    expect(() => assertMediaType("audio")).toThrow(/--media-type must be one of/);
    expect(MEDIA_TYPES).toEqual(["video", "image"]);
  });
});

describe("describeRowAssets for images", () => {
  const imageRow = (slug, extra = {}) => ({
    _id: `id-${slug}`,
    slug,
    type: "image",
    format: "jpg",
    url: ORPHAN,
    thumbnail_url: ORPHAN,
    file_size: 1234,
    ...extra,
  });

  // Legacy storage URLs carry no extension, so the row's own `format` is the
  // only thing that names what the bytes are.
  it("names the archive file from the row format when the url has no extension", () => {
    const [image] = describeRowAssets(imageRow("beksinski-tower", { format: "webp" }), "image");

    expect(image.kind).toBe("image");
    expect(image.relativePath).toBe("image/beksinski-tower.webp");
    expect(image.format).toBe("webp");
    expect(image.bytes).toBe(1234);
  });

  // 104 of the 105 endangered image rows hold the same URL string twice. Taking
  // that literally would archive and upload identical bytes under two names.
  it("does not archive a thumbnail that is the same object as the image", () => {
    const assets = describeRowAssets(imageRow("same"), "image");

    expect(assets).toHaveLength(1);
    expect(assets[0].kind).toBe("image");
  });

  it("does archive a thumbnail that genuinely points somewhere else", () => {
    const assets = describeRowAssets(imageRow("split", { thumbnail_url: ORPHAN2 }), "image");

    expect(assets.map((asset) => asset.relativePath)).toEqual([
      "image/split.jpg",
      "image/split-thumbnail.jpg",
    ]);
  });

  it("tolerates a row with no thumbnail at all", () => {
    expect(describeRowAssets(imageRow("bare", { thumbnail_url: undefined }), "image")).toHaveLength(1);
  });

  // An image slug and a video slug can coincide; separate prefixes are what stop
  // the second archive write from destroying the first master.
  it("keeps images out of the video and poster directories", () => {
    const image = describeRowAssets(imageRow("tracers"), "image")[0];
    const video = describeRowAssets(row("tracers"), "video")[0];

    expect(detectArchiveCollisions([image, video])).toEqual([]);
  });

  it("records the endangered host, so the plan can report what is at risk", () => {
    const [image] = describeRowAssets(imageRow("at-risk"), "image");

    expect(image).toMatchObject({ risk: RISK.UNKNOWN, atRisk: true });
  });
});

describe("buildArchivePlan", () => {
  it("is plain slug order, keeping a row's video and poster adjacent", () => {
    const plan = buildArchivePlan([row("beta"), row("alpha")]);

    expect(plan.map((asset) => `${asset.slug}/${asset.kind}`)).toEqual([
      "alpha/thumbnail",
      "alpha/video",
      "beta/thumbnail",
      "beta/video",
    ]);
  });

  it("is deterministic regardless of input order", () => {
    const rows = [row("c"), row("a"), row("b")];

    expect(buildArchivePlan(rows)).toEqual(buildArchivePlan([...rows].reverse()));
  });

  it("does not reorder by size, risk, or anything else", () => {
    const plan = buildArchivePlan([
      row("a", { url: PROD, thumbnail_url: undefined, file_size: 4_800_000_000 }),
      row("b", { url: ORPHAN, thumbnail_url: undefined, file_size: 10 }),
    ]);

    expect(plan.map((asset) => asset.slug)).toEqual(["a", "b"]);
  });
});

describe("detectArchiveCollisions", () => {
  // exFAT preserves case but compares without it. Two archive names differing
  // only by case are one file, and the second write silently destroys the first
  // master — the exact outcome this script exists to prevent.
  it("catches names that differ only by case", () => {
    const collisions = detectArchiveCollisions([
      { slug: "Tracers", kind: "video", relativePath: "video/Tracers.mp4" },
      { slug: "tracers", kind: "video", relativePath: "video/tracers.mp4" },
    ]);

    expect(collisions).toHaveLength(1);
    expect(collisions[0].identical).toBe(false);
    expect(collisions[0].slugs).toEqual(["Tracers", "tracers"]);
  });

  it("catches two rows sharing a slug outright", () => {
    const collisions = detectArchiveCollisions([
      { slug: "shadow-people", kind: "video", relativePath: "video/shadow-people.mp4" },
      { slug: "shadow-people", kind: "video", relativePath: "video/shadow-people.mp4" },
    ]);

    expect(collisions[0].identical).toBe(true);
  });

  it("does not confuse a video with its own poster", () => {
    expect(
      detectArchiveCollisions([
        { slug: "a", kind: "video", relativePath: "video/a.mp4" },
        { slug: "a", kind: "thumbnail", relativePath: "poster/a-poster.jpg" },
      ]),
    ).toEqual([]);
  });

  it("does not fire on distinct lowercase kebab slugs", () => {
    expect(
      detectArchiveCollisions([
        { slug: "a-one", kind: "video", relativePath: "video/a-one.mp4" },
        { slug: "a-two", kind: "video", relativePath: "video/a-two.mp4" },
      ]),
    ).toEqual([]);
  });

  it("folds accented names the way the filesystem would", () => {
    const collisions = detectArchiveCollisions([
      { slug: "café", kind: "video", relativePath: "video/café.mp4" },
      { slug: "CAFÉ", kind: "video", relativePath: "video/CAFÉ.mp4" },
    ]);

    expect(collisions).toHaveLength(1);
  });

  it("is deterministic in its reporting order", () => {
    const assets = [
      { slug: "B", kind: "video", relativePath: "video/B.mp4" },
      { slug: "b", kind: "video", relativePath: "video/b.mp4" },
      { slug: "A", kind: "video", relativePath: "video/A.mp4" },
      { slug: "a", kind: "video", relativePath: "video/a.mp4" },
    ];

    expect(detectArchiveCollisions(assets).map((c) => c.foldedPath)).toEqual([
      "video/a.mp4",
      "video/b.mp4",
    ]);
  });
});

describe("hasRoomFor", () => {
  it("keeps the reserve intact", () => {
    expect(hasRoomFor({ availableBytes: 1000, reserveBytes: 200, fileBytes: 800 }).fits).toBe(true);
    expect(hasRoomFor({ availableBytes: 1000, reserveBytes: 200, fileBytes: 801 }).fits).toBe(false);
  });

  it("refuses a file whose size is unknown rather than discovering it mid-write", () => {
    const result = hasRoomFor({ availableBytes: 1e12, reserveBytes: 0, fileBytes: null });

    expect(result.fits).toBe(false);
    expect(result.reason).toContain("unknown");
  });

  it("explains the shortfall in bytes", () => {
    expect(hasRoomFor({ availableBytes: 100, reserveBytes: 0, fileBytes: 500 }).reason).toContain("500");
  });
});

describe("planArchiveBudget", () => {
  const asset = (slug, bytes) => ({ slug, kind: "video", bytes });

  it("confirms the archive volume holds the corpus", () => {
    // Measured 2026-08-10: /Volumes/DeepSeek is exFAT with 639 GB free against
    // 44.62 GB of masters. This is the live configuration, so it is pinned.
    const budget = planArchiveBudget([asset("corpus", 44.62e9)], {
      availableBytes: 639e9,
      reserveBytes: DEFAULT_RESERVE_BYTES,
    });

    expect(budget.sufficient).toBe(true);
    expect(budget.shortfallBytes).toBe(0);
    expect(budget.usableBytes).toBeGreaterThan(44.62e9);
  });

  it("reports the shortfall when a volume cannot hold the job", () => {
    const budget = planArchiveBudget([asset("a", 30_000), asset("b", 20_000)], {
      availableBytes: 28_000,
      reserveBytes: 1_000,
    });

    expect(budget.sufficient).toBe(false);
    expect(budget.shortfallBytes).toBe(23_000);
  });

  it("counts assets whose size the row does not record", () => {
    const budget = planArchiveBudget([asset("a", null), asset("b", 10)], {
      availableBytes: 1000,
      reserveBytes: 0,
    });

    expect(budget.unknownSizes).toBe(1);
    expect(budget.totalBytes).toBe(10);
  });

  it("never reports negative usable space on a full volume", () => {
    const budget = planArchiveBudget([asset("a", 10)], { availableBytes: 5, reserveBytes: 100 });

    expect(budget.usableBytes).toBe(0);
  });
});

describe("summarizeRisk", () => {
  it("counts assets by host and totals what is at risk", () => {
    const summary = summarizeRisk([
      ...describeRowAssets(row("a", { url: ORPHAN, thumbnail_url: DEV })),
      ...describeRowAssets(row("b", { url: PROD, thumbnail_url: PROD })),
    ]);

    expect(summary.total).toBe(4);
    expect(summary.atRisk).toBe(2);
    expect(summary.safe).toBe(2);
    expect(summary.byHost["orphan-one.example.invalid"]).toBe(1);
    expect(summary.byHost["dev.example.invalid"]).toBe(1);
  });
});

describe("assertArchiveAllowed", () => {
  it("refuses without --write", () => {
    expect(() => assertArchiveAllowed({ writeRequested: false, dryRun: true }, [])).toThrow(/requires --write/);
  });

  it("refuses without --confirm-archive", () => {
    expect(() => assertArchiveAllowed({ writeRequested: true, dryRun: false }, ["--write"])).toThrow(
      /--confirm-archive/,
    );
  });

  it("allows the full ceremony", () => {
    expect(() =>
      assertArchiveAllowed({ writeRequested: true, dryRun: false }, ["--write", "--confirm-archive"]),
    ).not.toThrow();
  });
});
