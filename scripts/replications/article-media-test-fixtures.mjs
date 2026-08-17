/** Shared deterministic inputs for article-media planning tests. */
export const DECISIONS = {
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

export function facts(overrides = {}) {
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

export function asset(overrides = {}) {
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

