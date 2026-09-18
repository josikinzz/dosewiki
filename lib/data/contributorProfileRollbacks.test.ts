import { describe, expect, it } from "vitest";

import { rollbackReviewedProfilePlanHandler } from "../../server/lib/contributorProfileImports";
import { PROFILE_ID, mutationContext, profile, storedProfile } from "./contributorProfileImports.testHarness";

describe("rollbackReviewedProfilePlanHandler", () => {
  const operationId = "replication-index-2026-08-30";
  const provenance = `reviewed-profile-import:${operationId}:editor@example.com`;
  const reviewedNewEntry = {
    outcome: "reviewed-new" as const,
    creatorName: "New Artist",
    creatorKind: "person" as const,
    expectedAbsent: true as const,
    profile: profile({
      key: "NEW-ARTIST",
      displayName: "New Artist",
      aliases: ["new artist"],
      bio: "Reviewed replication artist.",
    }),
  };

  it("dry-runs an exact campaign-created deletion without writing", async () => {
    const campaignRow = storedProfile(reviewedNewEntry.profile, {
      _id: "profile-created",
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      updatedBy: provenance,
    });
    const { ctx, remove, patch } = mutationContext([campaignRow]);

    await expect(rollbackReviewedProfilePlanHandler(ctx, {
      operationId,
      dryRun: true,
      entries: [reviewedNewEntry],
    })).resolves.toMatchObject({
      deleted: 1,
      restored: 0,
      unchanged: 0,
      rows: [{ action: "would-delete", key: "NEW-ARTIST", profileId: "profile-created" }],
    });
    expect(remove).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("deletes only an exact campaign-created reviewed-new row", async () => {
    const campaignRow = storedProfile(reviewedNewEntry.profile, {
      _id: "profile-created",
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      updatedBy: provenance,
    });
    const { ctx, remove, rows } = mutationContext([campaignRow]);

    await expect(rollbackReviewedProfilePlanHandler(ctx, {
      operationId,
      dryRun: false,
      entries: [reviewedNewEntry],
    })).resolves.toMatchObject({
      deleted: 1,
      rows: [{ action: "deleted", key: "NEW-ARTIST", profileId: "profile-created" }],
    });
    expect(remove).toHaveBeenCalledWith("profile-created");
    expect(rows).toHaveLength(0);
  });

  it("restores the exact prior reviewed state for an existing profile", async () => {
    const expected = profile();
    const desired = profile({ bio: "Campaign bio" });
    const current = storedProfile(desired, { updatedBy: provenance });
    const { ctx, patch, rows } = mutationContext([current]);

    await expect(rollbackReviewedProfilePlanHandler(ctx, {
      operationId,
      dryRun: false,
      entries: [{
        outcome: "existing-profile",
        creatorName: "Artist Name",
        creatorKind: "person",
        profileId: PROFILE_ID,
        expected,
        profile: desired,
      }],
    })).resolves.toMatchObject({
      deleted: 0,
      restored: 1,
      rows: [{ action: "restored", key: "ARTIST", profileId: PROFILE_ID }],
    });
    expect(patch).toHaveBeenCalledWith(
      PROFILE_ID,
      expect.objectContaining({ bio: "Existing bio", updatedBy: "editor@example.com" }),
    );
    expect(rows[0]).toMatchObject({ bio: "Existing bio", updatedBy: "editor@example.com" });
  });

  it.each([
    ["reviewed fields drift", { bio: "Somebody edited this later", updatedBy: provenance }],
    ["provenance drift", { bio: "Campaign bio", updatedBy: "another-operation" }],
  ])("fails closed when an existing profile has %s", async (_label, currentState) => {
    const expected = profile();
    const desired = profile({ bio: "Campaign bio" });
    const current = storedProfile(currentState);
    const { ctx, patch, remove } = mutationContext([current]);

    await expect(rollbackReviewedProfilePlanHandler(ctx, {
      operationId,
      dryRun: false,
      entries: [{
        outcome: "existing-profile",
        creatorName: "Artist Name",
        creatorKind: "person",
        profileId: PROFILE_ID,
        expected,
        profile: desired,
      }],
    })).rejects.toThrow(/changed after campaign import/);
    expect(patch).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("fails closed before deletion when reviewed-new provenance is absent", async () => {
    const preexistingLookalike = storedProfile(reviewedNewEntry.profile, {
      _id: "profile-created",
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      updatedBy: "editor@example.com",
    });
    const { ctx, remove } = mutationContext([preexistingLookalike]);

    await expect(rollbackReviewedProfilePlanHandler(ctx, {
      operationId,
      dryRun: false,
      entries: [reviewedNewEntry],
    })).rejects.toThrow(/not an exact campaign-created row/);
    expect(remove).not.toHaveBeenCalled();
  });

  it("is idempotent when a created row is already absent and an existing row is already restored", async () => {
    const restored = storedProfile();
    const { ctx, remove, patch } = mutationContext([restored]);

    await expect(rollbackReviewedProfilePlanHandler(ctx, {
      operationId,
      dryRun: false,
      entries: [
        reviewedNewEntry,
        {
          outcome: "existing-profile",
          creatorName: "Artist Name",
          creatorKind: "person",
          profileId: PROFILE_ID,
          expected: profile(),
          profile: profile({ bio: "Campaign bio" }),
        },
      ],
    })).resolves.toMatchObject({
      deleted: 0,
      restored: 0,
      unchanged: 2,
      rows: [{ action: "unchanged" }, { action: "unchanged" }],
    });
    expect(remove).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("rejects rollback batches above the 50-entry transaction bound", async () => {
    const { ctx, remove, patch } = mutationContext();
    await expect(rollbackReviewedProfilePlanHandler(ctx, {
      operationId,
      dryRun: true,
      entries: Array.from({ length: 51 }, () => reviewedNewEntry),
    })).rejects.toThrow(/1 to 50 entries/);
    expect(remove).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });
});
