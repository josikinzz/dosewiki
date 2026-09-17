import fs from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { sanitizeContributorAvatarUrl } from "../../lib/contributorProfileIdentity";
import {
  AVATAR_SIZE,
  avatarOnlyImportRow,
  avatarUrlForKey,
  centreSquare,
  frameLadder,
  importRowDiff,
  preferredTier,
  projectedStoredProfile,
  rankMeasuredCandidates,
} from "./generate-avatars-from-replications";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "data/contributors/contributorAvatarSources.json");

/**
 * Read rather than `import`, so this file typechecks in a checkout where the
 * manifest has not been generated yet. The assertions below are what make its
 * absence a failure.
 */
function loadManifest(): { avatars: any[] } {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

/**
 * A curated slug, taken from the same file the script reads. Hard-coding a
 * literal here would pass while the curation file said something else entirely.
 */
const CURATED_SLUG = "forest-of-life-loka";

describe("avatar source selection", () => {
  it("prefers a curated work over an uncurated still", () => {
    const tier = preferredTier([
      { slug: "some-still", type: "image" },
      { slug: CURATED_SLUG, type: "video" },
    ]);

    expect(tier.map((row) => row.slug)).toEqual([CURATED_SLUG]);
  });

  it("prefers a still over a video when neither is curated", () => {
    const tier = preferredTier([
      { slug: "a-video", type: "video" },
      { slug: "a-still", type: "image" },
    ]);

    expect(tier.map((row) => row.slug)).toEqual(["a-still"]);
  });

  it("keeps every video when a contributor has no stills", () => {
    const tier = preferredTier([
      { slug: "b-video", type: "video" },
      { slug: "a-video", type: "video" },
    ]);

    expect(tier.map((row) => row.slug).sort()).toEqual(["a-video", "b-video"]);
  });

  it("ranks by the largest square the source can yield, then by slug", () => {
    const ranked = rankMeasuredCandidates([
      { slug: "zebra", type: "image", featured: false, squareSide: 900 },
      // A wide panorama: far more pixels, but a square crop is bounded by 200.
      { slug: "panorama", type: "image", featured: false, squareSide: 200 },
      { slug: "apple", type: "image", featured: false, squareSide: 900 },
    ]);

    expect(ranked.map((candidate) => candidate.slug)).toEqual(["apple", "zebra", "panorama"]);
  });
});

describe("centre square crop", () => {
  it("takes the middle of a landscape source", () => {
    expect(centreSquare({ width: 1000, height: 400 })).toEqual({
      left: 300,
      top: 0,
      side: 400,
      output: AVATAR_SIZE,
    });
  });

  it("takes the middle of a portrait source rather than its top", () => {
    expect(centreSquare({ width: 400, height: 1000 })).toEqual({
      left: 0,
      top: 300,
      side: 400,
      output: AVATAR_SIZE,
    });
  });

  it("never enlarges a source that is smaller than the delivered size", () => {
    expect(centreSquare({ width: 180, height: 240 })).toMatchObject({ side: 180, output: 180 });
  });
});

describe("video frame ladder", () => {
  it("never starts at t=0, where a fade-in yields black", () => {
    expect(frameLadder(30)[0]).toBeGreaterThan(0);
  });

  it("drops rungs at or past the end of the clip", () => {
    expect(frameLadder(2.5)).toEqual([1, 2]);
  });

  it("samples the midpoint of a clip shorter than the first rung", () => {
    expect(frameLadder(0.5)).toEqual([0.25]);
  });
});

describe("the Postgres patch", () => {
  const stored = {
    key: "LOKA",
    displayName: "Loka",
    aliases: ["loka"],
    bio: "",
    links: [{ label: "example.com", url: "https://example.com/" }],
    role: "Replication Artist",
    membershipEmail: "loka@example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-02T00:00:00.000Z",
    updatedBy: "someone@example.com",
  };

  it("changes avatarUrl and nothing else, measured against what the mutation stores", () => {
    const row = avatarOnlyImportRow(stored, "/profile-avatars/loka/avatar.webp");
    expect(importRowDiff(stored, projectedStoredProfile(row))).toEqual(["avatarUrl"]);
  });

  it("catches a field the mutation would reshape on its way in", () => {
    // sanitizeLinks accepts HTTPS only, so echoing an http link back would drop
    // it. The diff has to see that, or "only avatarUrl changed" is a fiction.
    const withInsecureLink = {
      ...stored,
      links: [{ label: "example.com", url: "http://example.com/" }],
    };
    const row = avatarOnlyImportRow(withInsecureLink, "/profile-avatars/loka/avatar.webp");
    expect(importRowDiff(withInsecureLink, projectedStoredProfile(row))).toEqual([
      "avatarUrl",
      "links",
    ]);
  });

  it("restates the fields bulkImport would otherwise silently reset", () => {
    const row = avatarOnlyImportRow(stored, "/profile-avatars/loka/avatar.webp");
    expect(row.createdAt).toBe(stored.createdAt);
    expect(row.updatedAt).toBe(stored.updatedAt);
    expect(row.updatedBy).toBe(stored.updatedBy);
    expect(row.membershipEmail).toBe(stored.membershipEmail);
    expect(row.role).toBe(stored.role);
  });

  it("supplies the bio and links the validator requires even when they are absent", () => {
    const row = avatarOnlyImportRow({ key: "X", displayName: "X" }, "/profile-avatars/x/avatar.webp");
    expect(row.bio).toBe("");
    expect(row.links).toEqual([]);
  });
});

describe("contributorAvatarSources.json", () => {
  // Read in a hook rather than at collection time: a missing manifest should
  // fail these assertions, not take the pure unit tests above down with it.
  let entries: any[];
  beforeAll(() => {
    entries = loadManifest().avatars;
  });

  it("records a source for every avatar it claims", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.source.replicationSlug, entry.profileKey).toBeTruthy();
      expect(entry.source.artist, entry.profileKey).toBeTruthy();
    }
  });

  it("names one avatar per contributor", () => {
    const keys = entries.map((entry) => entry.profileKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses a URL the app will accept, matching the profile key", () => {
    for (const entry of entries) {
      expect(entry.avatarUrl).toBe(avatarUrlForKey(entry.profileKey));
      expect(sanitizeContributorAvatarUrl(entry.avatarUrl)).toBe(entry.avatarUrl);
    }
  });

  it("points at a file that exists and is the square it claims to be", () => {
    for (const entry of entries) {
      const filePath = path.join(ROOT, "public", entry.avatarUrl.replace(/^\//, ""));
      expect(fs.existsSync(filePath), entry.avatarUrl).toBe(true);

      // Read the delivered bytes rather than trusting the manifest: a WebP
      // header carries its own canvas size, and 0x2E505257 ("RIFF"/"WEBP" with
      // a VP8L chunk) is the only place the truth is stored.
      const bytes = fs.readFileSync(filePath);
      expect(bytes.subarray(0, 4).toString("ascii"), entry.avatarUrl).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii"), entry.avatarUrl).toBe("WEBP");

      const { width, height } = readWebpDimensions(bytes);
      expect(width, entry.avatarUrl).toBe(entry.output.width);
      expect(height, entry.avatarUrl).toBe(entry.output.height);
      expect(width, entry.avatarUrl).toBe(height);
      expect(width, entry.avatarUrl).toBeLessThanOrEqual(AVATAR_SIZE);
    }
  });

  it("does not claim an avatar for a contributor who already had one", () => {
    const preexisting = ["JOSIE", "SYMMETRICVISION", "HYPNAGOGIST", "RHO", "MAETHOR"];
    for (const key of preexisting) {
      expect(entries.some((entry) => entry.profileKey === key)).toBe(false);
    }
  });
});

/** Canvas dimensions straight out of a VP8/VP8L/VP8X chunk header. */
function readWebpDimensions(bytes: Buffer): { width: number; height: number } {
  const chunk = bytes.subarray(12, 16).toString("ascii");

  if (chunk === "VP8 ") {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (chunk === "VP8X") {
    return {
      width: (bytes.readUIntLE(24, 3) & 0xffffff) + 1,
      height: (bytes.readUIntLE(27, 3) & 0xffffff) + 1,
    };
  }

  throw new Error(`Unrecognised WebP chunk ${chunk}`);
}
