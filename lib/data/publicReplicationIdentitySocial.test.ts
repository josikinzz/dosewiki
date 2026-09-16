import { describe, expect, it } from "vitest";
import { hasPublicDifferentCreatorProof } from "../../server/publicReplicationIdentitySocial";

const DIGEST = "a".repeat(64);
const base = {
  poster_display_name: "ArchivePoster",
  poster_profile_id: "poster-profile",
  poster_posted_at: Date.UTC(2025, 0, 1),
  creator_display_name: "Documented Creator",
  creator_profile_id: "creator-profile",
  creator_determination: "proven-different-creator" as const,
  review_status: "creator-proven" as const,
  evidence: [{
    kind: "earlier-exact-source",
    reference_url: "https://example.test/original",
    published_at: Date.UTC(2020, 0, 1),
    supports_source_digest: DIGEST,
  }],
  source_digest: DIGEST,
};

describe("public replication identity projection", () => {
  it("shows a different creator only with evidence-bound earlier proof", () => {
    expect(hasPublicDifferentCreatorProof(base)).toBe(true);
    expect(hasPublicDifferentCreatorProof({
      ...base,
      evidence: [{ ...base.evidence[0], supports_source_digest: "b".repeat(64) }],
    })).toBe(false);
    expect(hasPublicDifferentCreatorProof({
      ...base,
      evidence: [{ ...base.evidence[0], published_at: Date.UTC(2026, 0, 1) }],
    })).toBe(false);
  });

  it("collapses unresolved and false-alarm states to poster-as-creator", () => {
    expect(hasPublicDifferentCreatorProof({
      ...base,
      creator_determination: "unresolved",
      review_status: "obvious-conflict-needs-research",
    })).toBe(false);
    expect(hasPublicDifferentCreatorProof({
      ...base,
      creator_determination: "poster-presumed-creator",
      review_status: "reviewed-no-obvious-conflict",
      creator_display_name: base.poster_display_name,
      creator_profile_id: base.poster_profile_id,
    })).toBe(false);
  });
});
