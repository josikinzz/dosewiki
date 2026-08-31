import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  attributionReplicationSnapshotMatches,
  validateAttributionUpdate,
} from "../../convex/lib/replicationAttribution";
import type { AttributionBatchUpdate } from "../../convex/lib/replicationAttributionValidators";

const SHA = "a".repeat(64);
const DIGEST = "b".repeat(64);
const ID = "k570001ahn17r642ptx0pr4hps8dgg0s" as Id<"replications">;

function update(overrides: Partial<AttributionBatchUpdate> = {}): AttributionBatchUpdate {
  return {
    expected: {
      id: ID,
      slug: "example-reddit-post",
      artist: "Unknown Artist",
      artist_url: null,
      credit_line: "Creator unknown.",
      rightsholder: null,
      source_catalog_id: `reddit-sha256:${SHA}`,
      source_sha256: SHA,
    },
    intended_credit: {
      artist: "ExamplePoster",
      artist_url: "https://www.reddit.com/user/ExamplePoster/",
      credit_line: "Posted by ExamplePoster on r/replications.",
      rightsholder: null,
    },
    attribution: {
      reddit_post_ids: ["abc123"],
      poster: {
        display_name: "ExamplePoster",
        normalized_name: "exampleposter",
        profile_url: "https://www.reddit.com/user/ExamplePoster/",
        state: "named",
        source_role: "submitter",
      },
      source_references: [{
        reference_id: "abc123:000:example",
        post_id: "abc123",
        post_url: "https://www.reddit.com/r/replications/comments/abc123/example/",
        poster_display_name: "ExamplePoster",
        poster_profile_url: "https://www.reddit.com/user/ExamplePoster/",
        source_url: "https://i.imgur.com/example.jpg",
        role: "primary",
      }],
      disposition: "poster-as-artist-default",
      proposed_artist: "ExamplePoster",
      review_required: false,
      source_digest: DIGEST,
    },
    ...overrides,
  };
}

describe("replication attribution contract", () => {
  it("accepts a named poster as the default public artist", () => {
    expect(() => validateAttributionUpdate(update())).not.toThrow();
  });

  it("accepts a reviewed creator override without promoting the poster", () => {
    const value = update();
    value.intended_credit.artist = "Credited Creator";
    value.intended_credit.artist_url = null;
    value.attribution.proposed_artist = "Credited Creator";
    value.attribution.disposition = "reviewed-creator-override";
    value.attribution.reviewed_creator_override = {
      creator_name: "Credited Creator",
      creator_kind: "person",
      decision: "verified",
      evidence_digest: "c".repeat(64),
    };
    expect(() => validateAttributionUpdate(value)).not.toThrow();
  });

  it("keeps multi-poster rows review-required", () => {
    const value = update();
    value.attribution.poster = { state: "multiple", source_role: "submitter" };
    value.attribution.disposition = "multiple-posters-require-review";
    value.attribution.review_required = true;
    expect(() => validateAttributionUpdate(value)).not.toThrow();

    value.attribution.review_required = false;
    expect(() => validateAttributionUpdate(value)).toThrow("must remain review-required");
  });

  it("rejects unbound source references and non-Reddit profile URLs", () => {
    const unbound = update();
    unbound.attribution.source_references[0].post_id = "different";
    expect(() => validateAttributionUpdate(unbound)).toThrow("not bound");

    const foreignProfile = update();
    foreignProfile.attribution.poster.profile_url = "https://example.com/ExamplePoster";
    expect(() => validateAttributionUpdate(foreignProfile)).toThrow("Reddit profile URL");
  });

  it("compares every guarded credit and source identity field", () => {
    const value = update();
    const row = {
      _id: ID,
      slug: value.expected.slug,
      artist: value.expected.artist,
      artist_url: undefined,
      credit_line: value.expected.credit_line ?? undefined,
      rightsholder: undefined,
      source_catalog_id: value.expected.source_catalog_id,
      source_sha256: value.expected.source_sha256,
    };
    expect(attributionReplicationSnapshotMatches(row, value.expected)).toBe(true);
    expect(attributionReplicationSnapshotMatches(
      { ...row, artist: "Changed Artist" },
      value.expected,
    )).toBe(false);
  });
});
