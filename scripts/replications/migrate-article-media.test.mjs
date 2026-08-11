import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPublishableReplication } from "@/types/replications";
import {
  buildCreditLine,
  expectsPublication,
  groupSkips,
  isNamedCreator,
  mediaTypeFromContentType,
  normalizeArtist,
  parseAttribution,
  planMigration,
  planRow,
  readUploadFacts,
  selectCandidates,
  sniffMediaContentType,
  verifyInsertedRow,
} from "./migrate-article-media.mjs";

const DECISIONS = {
  ownerRulings: {
    unknownArtistMarker: "Unknown",
    unknownArtistAliases: ["anonymous", "anonymous 420chan user", "unknown", ""],
    promoted: [
      {
        id: "A023",
        reason: "Owner ruled the credit.",
        artist: "Chelsea Morgan",
        permission_notes: "Owner ruling recorded.",
        allowDuplicateOfSlug: "smeared-walk-through-the-woods-oracle-emissary",
      },
    ],
    heldGroups: [{ name: "audio", reason: "Nothing renders audio yet.", ids: ["A046"] }],
    deadAssetsLeftDead: { $comment: "Left dead on purpose.", ids: ["A021"] },
    droppedAssets: [
      { name: "not-media", ids: ["A138"], reason: "A corrupted hyperlink, not an embed." },
    ],
    variantGroups: [
      {
        name: "sunflower",
        ids: ["A072", "A073"],
        chosen: "A073",
        reason: "Same crop; A073 is the better encode.",
      },
    ],
    artistCorrections: [
      { ids: ["A020"], storedArtist: "Alice", artist: "John Tenniel", reason: "A character, not the engraver." },
    ],
  },
  verifiedDuplicates: [
    {
      id: "A001",
      existingSlug: "double-vision-chelsea-morgan",
      method: "confirmed by eye",
      correlation: 0.9974,
      rmse: 0.0186,
      note: "Same photograph, upscaled.",
    },
  ],
  storageIds: {},
};

function facts(overrides = {}) {
  return {
    storageId: "kg2storage000000000000000000000a",
    reachable: true,
    status: 200,
    contentType: "image/jpeg",
    size: 1234,
    digest: "digest-a",
    width: 640,
    height: 480,
    ...overrides,
  };
}

function asset(overrides = {}) {
  return {
    id: "A100",
    slug: "a-new-work-jane-doe",
    title: "A new work",
    role: "replication",
    artist_name: "Jane Doe",
    effect_slug: "tracers",
    attribution: "https://example.test/work.jpg (rightsholder Jane Doe)",
    confidence: "strong",
    evidence: "",
    ...overrides,
  };
}

describe("normalizeArtist", () => {
  it("collapses every spelling of absence onto the corpus marker", () => {
    const options = { marker: "Unknown", aliases: DECISIONS.ownerRulings.unknownArtistAliases };
    expect(normalizeArtist("Anonymous", options)).toBe("Unknown");
    expect(normalizeArtist("anonymous 420chan user", options)).toBe("Unknown");
    expect(normalizeArtist("   ", options)).toBe("Unknown");
    expect(normalizeArtist(null, options)).toBe("Unknown");
    expect(normalizeArtist("Unknown", options)).toBe("Unknown");
  });

  it("leaves a real credit alone, trimmed", () => {
    expect(normalizeArtist("  Chelsea Morgan ")).toBe("Chelsea Morgan");
  });
});

describe("isNamedCreator", () => {
  it("reads the marker as nobody, matching hasKnownCreator", () => {
    expect(isNamedCreator("Unknown")).toBe(false);
    expect(isNamedCreator("unknown")).toBe(false);
    expect(isNamedCreator("Chelsea Morgan")).toBe(true);
  });
});

describe("buildCreditLine", () => {
  it("uses the table's two existing spellings", () => {
    expect(buildCreditLine("Grass", "Chelsea Morgan")).toBe("Grass by Chelsea Morgan");
    expect(buildCreditLine("Watch", "Unknown")).toBe("Watch (creator unknown)");
  });
});

describe("mediaTypeFromContentType", () => {
  it("stores an animated GIF as an image, like the six gif rows already do", () => {
    expect(mediaTypeFromContentType("image/gif")).toEqual({ type: "image", format: "gif" });
  });

  it("spells jpeg as jpg, the table's majority spelling", () => {
    expect(mediaTypeFromContentType("image/jpeg; charset=binary")).toEqual({
      type: "image",
      format: "jpg",
    });
  });

  it("returns null for a type it has no mapping for", () => {
    expect(mediaTypeFromContentType("application/pdf")).toBeNull();
    expect(mediaTypeFromContentType(undefined)).toBeNull();
  });
});

describe("parseAttribution", () => {
  it("splits a source URL and a rightsholder out of the prose", () => {
    expect(parseAttribution("https://example.test/a.jpg (rightsholder Luke Brown)")).toEqual({
      source_url: "https://example.test/a.jpg",
      rightsholder: "Luke Brown",
    });
  });

  it("asserts public domain only when the text says so", () => {
    expect(parseAttribution("John Tenniel, 1865 — public domain").rights_status).toBe("public-domain");
    expect(parseAttribution("Rightsholder somebody").rights_status).toBeUndefined();
  });

  it("keeps the leftover prose as a note", () => {
    const parsed = parseAttribution(
      "https://example.test/a.jpg (rightsholder H. R. Giger) — copyrighted fine art",
    );
    expect(parsed.permission_notes).toBe("copyrighted fine art");
  });

  it("returns nothing for an empty attribution", () => {
    expect(parseAttribution("")).toEqual({});
    expect(parseAttribution(null)).toEqual({});
  });
});

describe("selectCandidates", () => {
  it("takes strong replications and figures", () => {
    const { considered } = selectCandidates(
      [asset(), asset({ id: "A101", slug: "b", role: "figure" })],
      DECISIONS,
    );
    expect(considered.map((entry) => entry.asset.id)).toEqual(["A100", "A101"]);
  });

  it("leaves weak, needs-owner and unclear entries alone", () => {
    const { considered, excluded } = selectCandidates(
      [
        asset({ id: "W1", confidence: "weak" }),
        asset({ id: "W2", confidence: "needs-owner" }),
        asset({ id: "W3", role: "unclear" }),
      ],
      DECISIONS,
    );
    expect(considered).toHaveLength(0);
    expect(excluded.map((entry) => entry.reason)).toEqual([
      "confidence:weak",
      "confidence:needs-owner",
      "role:unclear",
    ]);
  });

  it("promotes an entry the owner ruled on even though it is not strong", () => {
    const { considered } = selectCandidates(
      [asset({ id: "A023", confidence: "needs-owner" })],
      DECISIONS,
    );
    expect(considered).toHaveLength(1);
    expect(considered[0].promotion.artist).toBe("Chelsea Morgan");
  });

  it("holds a held group ahead of every other test", () => {
    const { excluded } = selectCandidates([asset({ id: "A046" })], DECISIONS);
    expect(excluded[0].reason).toBe("held-group:audio");
  });

  it("keeps an owner-ruled dead asset out", () => {
    const { excluded } = selectCandidates([asset({ id: "A021", confidence: "weak" })], DECISIONS);
    expect(excluded[0].reason).toBe("owner-ruled-dead");
  });

  it("keeps a dropped asset out and says which ruling dropped it", () => {
    const { excluded } = selectCandidates([asset({ id: "A138" })], DECISIONS);
    expect(excluded[0].reason).toBe("owner-dropped:not-media");
    expect(excluded[0].detail).toContain("corrupted hyperlink");
  });

  it("keeps only the chosen copy of a variant pair, even though both are promoted", () => {
    // Both halves carry a ruling, so the exclusion has to be tested ahead of the
    // promotion or the losing copy is considered on the strength of its own.
    const decisions = {
      ...DECISIONS,
      ownerRulings: {
        ...DECISIONS.ownerRulings,
        promoted: [
          ...DECISIONS.ownerRulings.promoted,
          { id: "A072", reason: "One of two copies." },
          { id: "A073", reason: "The copy to publish." },
        ],
      },
    };
    const { considered, excluded } = selectCandidates(
      [asset({ id: "A072", confidence: "needs-owner" }), asset({ id: "A073", confidence: "needs-owner" })],
      decisions,
    );
    expect(considered.map((entry) => entry.asset.id)).toEqual(["A073"]);
    expect(excluded[0].reason).toBe("variant-not-chosen:sunflower");
  });
});

describe("planRow", () => {
  it("builds the mutation arguments from production's own facts", () => {
    const { row } = planRow({ asset: asset(), promotion: null, facts: facts(), decisions: DECISIONS });
    expect(row).toMatchObject({
      slug: "a-new-work-jane-doe",
      title: "A new work",
      artist: "Jane Doe",
      role: "replication",
      type: "image",
      format: "jpg",
      storage_id: "kg2storage000000000000000000000a",
      effect_slug: "tracers",
      credit_line: "A new work by Jane Doe",
      width: 640,
      height: 480,
      file_size: 1234,
      source_url: "https://example.test/work.jpg",
      rightsholder: "Jane Doe",
    });
  });

  it("omits effect_slug entirely rather than sending an empty string", () => {
    const { row } = planRow({
      asset: asset({ effect_slug: null }),
      promotion: null,
      facts: facts(),
      decisions: DECISIONS,
    });
    expect("effect_slug" in row).toBe(false);
  });

  it("never carries a duration onto an image", () => {
    const { row } = planRow({ asset: asset(), promotion: null, facts: facts(), decisions: DECISIONS });
    expect("duration" in row).toBe(false);
  });

  it("blocks an asset with no storage object", () => {
    const { blocked } = planRow({
      asset: asset(),
      promotion: null,
      facts: facts({ storageId: null }),
      decisions: DECISIONS,
    });
    expect(blocked.reason).toBe("no-storage");
  });

  it("blocks an asset production will not serve", () => {
    const { blocked } = planRow({
      asset: asset(),
      promotion: null,
      facts: facts({ reachable: false, status: 404 }),
      decisions: DECISIONS,
    });
    expect(blocked.reason).toBe("unreachable");
  });

  it("does not let an overridden attribution restore the credit the owner ruled against", () => {
    const { row } = planRow({
      asset: asset({
        id: "A023",
        artist_name: "Chelsea Morgan",
        attribution: "Existing row credits Oracle Emissary (rightsholder Oracle Emissary); this embed credits Chelsea Morgan",
      }),
      promotion: DECISIONS.ownerRulings.promoted[0],
      facts: facts(),
      decisions: DECISIONS,
    });
    expect(row.artist).toBe("Chelsea Morgan");
    expect(row.rightsholder).toBe("Chelsea Morgan");
    expect(row.permission_notes).toBe("Owner ruling recorded.");
  });

  it("applies an artist correction and records why", () => {
    const { row } = planRow({
      asset: asset({ id: "A020", artist_name: "Alice", attribution: "John Tenniel, 1865 — public domain" }),
      promotion: null,
      facts: facts(),
      decisions: DECISIONS,
    });
    expect(row.artist).toBe("John Tenniel");
    expect(row.credit_line).toBe("A new work by John Tenniel");
    expect(row.permission_notes).toContain('the embed stored "Alice" as the artist');
  });

  it("takes the role and the slug from a ruling that restates them", () => {
    const { row } = planRow({
      asset: asset({ id: "A051", role: "unclear", slug: "out-of-body-experience-stock-composite-description" }),
      promotion: { id: "A051", reason: "Staged stock.", role: "figure", slug: "out-of-body-experience-stock-composite" },
      facts: facts(),
      decisions: DECISIONS,
    });
    expect(row.role).toBe("figure");
    expect(row.slug).toBe("out-of-body-experience-stock-composite");
  });

  it("refuses a role the table has no shelf for, however it was arrived at", () => {
    const { blocked } = planRow({
      asset: asset({ role: "unclear" }),
      promotion: null,
      facts: facts(),
      decisions: DECISIONS,
    });
    expect(blocked.reason).toBe("role:unclear");
  });

  it("plans a recovered asset with no storage id and keeps its duration", () => {
    const { row } = planRow({
      asset: asset({ title: "Size distortions" }),
      promotion: { id: "A100", reason: "Recovered.", artist: "Unknown", source_url: "https://archive.test/clip.mp4" },
      facts: facts({
        storageId: null,
        contentType: "video/mp4",
        duration: 9.9,
        upload: { path: "recovered/A021.mp4", contentType: "video/mp4" },
      }),
      decisions: DECISIONS,
    });
    expect(row.storage_id).toBeNull();
    expect(row.type).toBe("video");
    expect(row.duration).toBe(9.9);
    // The one link that still resolves after the original host died.
    expect(row.source_url).toBe("https://archive.test/clip.mp4");
  });

  it("never puts a duration on an image, whatever the probe returned", () => {
    const { row } = planRow({
      asset: asset(),
      promotion: null,
      facts: facts({ duration: 0.98 }),
      decisions: DECISIONS,
    });
    expect("duration" in row).toBe(false);
  });

  it("turns an anonymous credit into the corpus marker", () => {
    const { row } = planRow({
      asset: asset({ artist_name: "Anonymous" }),
      promotion: null,
      facts: facts(),
      decisions: DECISIONS,
    });
    expect(row.artist).toBe("Unknown");
    expect(row.credit_line).toBe("A new work (creator unknown)");
  });
});

describe("planMigration", () => {
  const baseArgs = {
    decisions: DECISIONS,
    effectSlugs: new Set(["tracers", "recursion"]),
    existingRows: [],
    storageIdsInUse: new Map(),
  };

  it("plans a clean candidate", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [asset()],
      facts: new Map([["A100", facts()]]),
    });
    expect(plan.insert).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it("skips a candidate whose slug is already a production row", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [asset()],
      existingRows: [{ slug: "a-new-work-jane-doe", storage_id: "other" }],
      facts: new Map([["A100", facts()]]),
    });
    expect(plan.insert).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("already-migrated");
  });

  it("skips a candidate that reuses an existing row's storage object", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [asset()],
      existingRows: [{ slug: "already-here", storage_id: "kg2storage000000000000000000000a" }],
      facts: new Map([["A100", facts()]]),
    });
    expect(plan.skipped[0].reason).toBe("duplicate-of-existing");
    expect(plan.skipped[0].detail).toContain("already-here");
  });

  it("skips a candidate whose bytes hash to an existing row's bytes", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [asset()],
      existingRows: [{ slug: "same-bytes", storage_id: "kg2other" }],
      storageIdsInUse: new Map([["kg2other", "digest-a"]]),
      facts: new Map([["A100", facts()]]),
    });
    expect(plan.skipped[0].reason).toBe("duplicate-of-existing");
    expect(plan.skipped[0].detail).toContain("identical sha-256");
  });

  it("skips a near-duplicate that was verified by eye", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [asset({ id: "A001" })],
      facts: new Map([["A001", facts()]]),
    });
    expect(plan.skipped[0].reason).toBe("duplicate-of-existing");
    expect(plan.skipped[0].detail).toContain("double-vision-chelsea-morgan");
  });

  it("still inserts the row the owner ruled may duplicate an existing one", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [asset({ id: "A023", slug: "tracers-behind-a-moving-hand", confidence: "needs-owner" })],
      existingRows: [
        { slug: "smeared-walk-through-the-woods-oracle-emissary", storage_id: "kg2storage000000000000000000000a" },
      ],
      facts: new Map([["A023", facts()]]),
    });
    expect(plan.insert).toHaveLength(1);
    expect(plan.insert[0].row.artist).toBe("Chelsea Morgan");
  });

  it("collapses one object embedded twice into the same article", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [asset({ id: "A1", slug: "one" }), asset({ id: "A2", slug: "two" })],
      facts: new Map([
        ["A1", facts()],
        ["A2", facts()],
      ]),
    });
    expect(plan.insert).toHaveLength(1);
    expect(plan.skipped[0].reason).toBe("duplicate-within-batch");
  });

  it("keeps one object that legitimately illustrates two different effects", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [
        asset({ id: "A1", slug: "one", effect_slug: "tracers" }),
        asset({ id: "A2", slug: "two", effect_slug: "recursion" }),
      ],
      facts: new Map([
        ["A1", facts()],
        ["A2", facts()],
      ]),
    });
    expect(plan.insert).toHaveLength(2);
  });

  it("still inserts the second effect's row after the first landed in an earlier batch", () => {
    // The vasoconstriction/vasodilation diagram and the Wheeler circuit are each
    // one object filed under two effects, and each pair straddles a batch
    // boundary. Once the first row exists, a plain storage-id match would read
    // the second as a duplicate of it and drop it.
    const plan = planMigration({
      ...baseArgs,
      assets: [
        asset({ id: "A1", slug: "one", effect_slug: "tracers" }),
        asset({ id: "A2", slug: "two", effect_slug: "recursion" }),
      ],
      existingRows: [{ slug: "one", storage_id: "kg2storage000000000000000000000a", effect_slug: "tracers" }],
      facts: new Map([
        ["A1", facts()],
        ["A2", facts()],
      ]),
    });
    expect(plan.insert.map((entry) => entry.id)).toEqual(["A2"]);
    expect(plan.skipped.map((entry) => entry.reason)).toEqual(["already-migrated"]);
  });

  it("does not insert the same asset twice on the same effect across batches", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [
        asset({ id: "A1", slug: "one", effect_slug: "tracers" }),
        asset({ id: "A2", slug: "two", effect_slug: "tracers" }),
      ],
      existingRows: [{ slug: "one", storage_id: "kg2storage000000000000000000000a", effect_slug: "tracers" }],
      facts: new Map([
        ["A1", facts()],
        ["A2", facts()],
      ]),
    });
    expect(plan.insert).toHaveLength(0);
    expect(plan.skipped.map((entry) => entry.reason)).toEqual(["already-migrated", "already-migrated"]);
  });

  it("still treats a pre-existing row as a duplicate even on a different effect", () => {
    // `one` is not a slug this migration owns, so the asset alone settles it.
    const plan = planMigration({
      ...baseArgs,
      assets: [asset({ id: "A2", slug: "two", effect_slug: "recursion" })],
      existingRows: [
        { slug: "a-row-that-predates-this", storage_id: "kg2storage000000000000000000000a", effect_slug: "tracers" },
      ],
      facts: new Map([["A2", facts()]]),
    });
    expect(plan.insert).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("duplicate-of-existing");
  });

  it("carries a recovered asset's bytes onto the insert entry", () => {
    const decisions = {
      ...DECISIONS,
      ownerRulings: {
        ...DECISIONS.ownerRulings,
        promoted: [...DECISIONS.ownerRulings.promoted, { id: "A100", reason: "Recovered.", artist: "Unknown" }],
      },
    };
    const plan = planMigration({
      ...baseArgs,
      decisions,
      assets: [asset()],
      facts: new Map([["A100", facts({ storageId: null, upload: { path: "recovered/A021.mp4" } })]]),
    });
    expect(plan.insert).toHaveLength(1);
    expect(plan.insert[0].upload.path).toBe("recovered/A021.mp4");
    expect(plan.insert[0].row.storage_id).toBeNull();
  });

  it("catches a recovered asset whose bytes are already in the table", () => {
    // A recovered file has no storage id to compare, so the digest check has to
    // stand on its own or a re-upload of an existing work lands as a new row.
    const plan = planMigration({
      ...baseArgs,
      assets: [asset()],
      existingRows: [{ slug: "already-here", storage_id: "kg2other" }],
      storageIdsInUse: new Map([["kg2other", "digest-a"]]),
      facts: new Map([["A100", facts({ storageId: null, upload: { path: "recovered/a.gif" } })]]),
    });
    expect(plan.insert).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("duplicate-of-existing");
  });

  it("reads a row this migration inserted under a ruled slug as its own", () => {
    // The overridden slug is not in the curation file, so without it in the
    // migration's own slug set the second effect's row would be dropped as a
    // duplicate of one of the 247 that predate this migration.
    const decisions = {
      ...DECISIONS,
      ownerRulings: {
        ...DECISIONS.ownerRulings,
        promoted: [
          ...DECISIONS.ownerRulings.promoted,
          { id: "A1", reason: "First embed.", slug: "one-clean-slug" },
          { id: "A2", reason: "Second embed.", slug: "two-clean-slug" },
        ],
      },
    };
    const plan = planMigration({
      ...baseArgs,
      decisions,
      assets: [
        asset({ id: "A1", slug: "one-description", effect_slug: "tracers" }),
        asset({ id: "A2", slug: "two-summary", effect_slug: "recursion" }),
      ],
      existingRows: [
        { slug: "one-clean-slug", storage_id: "kg2storage000000000000000000000a", effect_slug: "tracers" },
      ],
      facts: new Map([
        ["A1", facts()],
        ["A2", facts()],
      ]),
    });
    expect(plan.insert.map((entry) => entry.row.slug)).toEqual(["two-clean-slug"]);
    expect(plan.skipped.map((entry) => entry.reason)).toEqual(["already-migrated"]);
  });

  it("refuses an effect slug that is not a subjectiveEffects row", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [asset({ effect_slug: "not-a-real-effect" })],
      facts: new Map([["A100", facts()]]),
    });
    expect(plan.skipped[0].reason).toBe("unknown-effect");
  });
});

describe("sniffMediaContentType", () => {
  it("reads the two container formats the recovered assets arrive as", () => {
    const mp4 = Buffer.alloc(16);
    mp4.write("ftyp", 4, "latin1");
    expect(sniffMediaContentType(mp4)).toBe("video/mp4");

    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]);
    expect(sniffMediaContentType(webm)).toBe("video/webm");
  });

  it("still answers for the image signatures repoint-renditions already knew", () => {
    const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(12)]);
    expect(sniffMediaContentType(gif)).toBe("image/gif");
  });

  it("returns null rather than guessing", () => {
    expect(sniffMediaContentType(Buffer.alloc(16))).toBeNull();
    expect(sniffMediaContentType(null)).toBeNull();
  });
});

describe("readUploadFacts", () => {
  const withFile = (bytes, run) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-uploads-"));
    fs.writeFileSync(path.join(dir, "asset.gif"), bytes);
    try {
      return run(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const gifBytes = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(64)]);
  // base64 sha-256 — the shape Convex reports a stored object's digest in, so a
  // recovered file can be compared against bytes production already holds.
  const gifDigest = "hcZyK+UUict5+eKb0kBAeFijMThy/6gw/nNKhkq9VWU=";

  it("reads the file's own facts and returns them as a pending upload", () => {
    const result = withFile(gifBytes, (dir) =>
      readUploadFacts({ path: "asset.gif", sha256: gifDigest, contentType: "image/gif" }, dir),
    );
    expect(result.storageId).toBeNull();
    expect(result.contentType).toBe("image/gif");
    expect(result.digest).toBe(gifDigest);
    expect(result.upload.path).toBe("asset.gif");
  });

  it("refuses bytes that are not the reviewed ones", () => {
    expect(() =>
      withFile(gifBytes, (dir) =>
        readUploadFacts({ path: "asset.gif", sha256: "not-the-reviewed-digest", contentType: "image/gif" }, dir),
      ),
    ).toThrow(/not the reviewed file/);
  });

  it("refuses a file whose container disagrees with the declared content type", () => {
    expect(() =>
      withFile(gifBytes, (dir) =>
        readUploadFacts({ path: "asset.gif", sha256: gifDigest, contentType: "image/jpeg" }, dir),
      ),
    ).toThrow(/where the decisions file records image\/jpeg/);
  });

  it("reports a missing file as unreachable rather than throwing", () => {
    const result = withFile(gifBytes, (dir) => readUploadFacts({ path: "gone.gif" }, dir));
    expect(result.reachable).toBe(false);
  });

  it("insists on being told where the recovered files are", () => {
    expect(() => readUploadFacts({ path: "asset.gif" }, null)).toThrow(/--uploads-dir/);
  });
});

describe("expectsPublication", () => {
  it("agrees with isPublishableReplication, the gate the site actually applies", () => {
    // Restating the gate in a script is only safe while the two agree, so the
    // real implementation is imported and compared rather than described.
    for (const row of [
      { role: "replication", type: "image" },
      { role: "replication", type: "video" },
      { role: "replication", type: "audio" },
      { role: "figure", type: "image" },
      { role: "figure", type: "video" },
      { role: "figure", type: "audio" },
    ]) {
      expect(expectsPublication(row)).toBe(isPublishableReplication(row));
    }
  });

  it("reads a replication image or video as published and everything else as withheld", () => {
    expect(expectsPublication({ role: "replication", type: "image" })).toBe(true);
    expect(expectsPublication({ role: "figure", type: "image" })).toBe(false);
    expect(expectsPublication({ role: "replication", type: "audio" })).toBe(false);
  });
});

describe("verifyInsertedRow", () => {
  const planned = {
    slug: "size-distortions",
    title: "Size distortions",
    artist: "Unknown",
    role: "replication",
    type: "video",
    format: "mp4",
    storage_id: "kg2storage000000000000000000000a",
  };
  const clientReturning = (row) => ({ query: async () => row });
  const servedAs = (contentType, status = 200) =>
    async () => ({ ok: status < 400, status, headers: { get: () => contentType } });

  it("passes a row that reads back as planned and serves its own format", async () => {
    const verdict = await verifyInsertedRow({
      client: clientReturning({ ...planned, url: "https://prod.test/a" }),
      row: planned,
      fetchImpl: servedAs("video/mp4"),
    });
    expect(verdict.ok).toBe(true);
  });

  it("fails a row whose media does not resolve — the page would not exist", async () => {
    const verdict = await verifyInsertedRow({
      client: clientReturning({ ...planned, url: null }),
      row: planned,
      fetchImpl: servedAs("video/mp4"),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("no media and no page");
  });

  it("fails a row served as a type that disagrees with its format", async () => {
    // The failure this exists for: the file is intact and the browser downloads
    // it instead of drawing it, which looks like a broken page and nothing else.
    const verdict = await verifyInsertedRow({
      client: clientReturning({ ...planned, url: "https://prod.test/a" }),
      row: planned,
      fetchImpl: servedAs("image/jpeg"),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("serves image/jpg");
  });

  it("fails a row whose role did not survive the write", async () => {
    const verdict = await verifyInsertedRow({
      client: clientReturning({ ...planned, role: "figure", url: "https://prod.test/a" }),
      row: planned,
      fetchImpl: servedAs("video/mp4"),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("publication gate");
  });

  it("fails a slug that reads back as nothing", async () => {
    const verdict = await verifyInsertedRow({
      client: clientReturning(null),
      row: planned,
      fetchImpl: servedAs("video/mp4"),
    });
    expect(verdict.ok).toBe(false);
  });
});

describe("groupSkips", () => {
  it("groups by reason, largest group first", () => {
    const grouped = groupSkips([
      { reason: "a", id: "1" },
      { reason: "b", id: "2" },
      { reason: "a", id: "3" },
    ]);
    expect(grouped.map(([reason, entries]) => [reason, entries.length])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});
