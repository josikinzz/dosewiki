import { describe, expect, it } from "vitest";
import {
  buildCreditLine,
  groupSkips,
  isNamedCreator,
  mediaTypeFromContentType,
  normalizeArtist,
  parseAttribution,
  planMigration,
  planRow,
  selectCandidates,
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

  it("refuses an effect slug that is not a subjectiveEffects row", () => {
    const plan = planMigration({
      ...baseArgs,
      assets: [asset({ effect_slug: "not-a-real-effect" })],
      facts: new Map([["A100", facts()]]),
    });
    expect(plan.skipped[0].reason).toBe("unknown-effect");
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
