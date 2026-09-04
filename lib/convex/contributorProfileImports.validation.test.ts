import { describe, expect, it } from "vitest";

import { importReviewedProfilePlanHandler } from "../../convex/lib/contributorProfileImports";
import { PROFILE_ID, mutationContext, profile } from "./contributorProfileImports.testHarness";

describe("importReviewedProfilePlanHandler typed blocks", () => {
  it("rejects a reviewed profile with a non-HTTPS official link", async () => {
    const { ctx, insert } = mutationContext();

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: false,
        entries: [
          {
            outcome: "reviewed-new",
            creatorName: "New Artist",
            creatorKind: "person",
            expectedAbsent: true,
            profile: profile({
              key: "NEW-ARTIST",
              displayName: "New Artist",
              links: [{ label: "Official site", url: "http://artist.example/" }],
            }),
          },
        ],
      }),
    ).rejects.toThrow(/invalid official link/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns a typed block for the four-link reviewed projection without truncating it", async () => {
    const reviewedOfficialLinkCandidates = [
      { kind: "official artist website candidate", url: "https://algaart.com/" },
      { kind: "Facebook page", url: "https://www.facebook.com/algaartworks/" },
      { kind: "Instagram profile", url: "https://www.instagram.com/alga_artist/" },
      { kind: "Reddit profile", url: "https://www.reddit.com/user/Algaart_Works/" },
    ];
    const projected = profile({
      key: "ANGUSLONG",
      displayName: "Angus Long",
      links: reviewedOfficialLinkCandidates.map(({ kind, url }) => ({ label: kind, url })),
    });
    const { ctx, insert, patch } = mutationContext();

    await expect(importReviewedProfilePlanHandler(ctx, {
      operationId: "replication-index-2026-08-30",
      dryRun: true,
      entries: [{
        outcome: "existing-profile",
        creatorName: "Angus Long",
        creatorKind: "person",
        profileId: PROFILE_ID,
        expected: profile({ key: "ANGUSLONG", displayName: "Angus Long" }),
        profile: projected,
      }],
    })).resolves.toMatchObject({
      blocked: 1,
      created: 0,
      updated: 0,
      rows: [{
        action: "blocked",
        blockReason: "official-link-limit",
        key: "ANGUSLONG",
        profileId: PROFILE_ID,
      }],
    });
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("rejects a write batch with a four-link profile before its first write", async () => {
    const { ctx, insert, patch } = mutationContext();

    await expect(importReviewedProfilePlanHandler(ctx, {
      operationId: "replication-index-2026-08-30",
      dryRun: false,
      entries: [{
        outcome: "reviewed-new",
        creatorName: "New Artist",
        creatorKind: "person",
        expectedAbsent: true,
        profile: profile({
          key: "NEW-ARTIST",
          displayName: "New Artist",
          links: [
            { label: "Official site", url: "https://artist.example/" },
            { label: "Instagram", url: "https://instagram.com/artist" },
            { label: "Facebook", url: "https://facebook.com/artist" },
            { label: "Reddit", url: "https://reddit.com/user/artist" },
          ],
        }),
      }],
    })).rejects.toThrow(/exceed the 3-link product limit/);
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed R2 key", { avatarR2Key: "avatars/new-artist.webp" }, /invalid avatar R2 reference/],
    ["placeholder storage id", { avatarStorageId: "placeholder-avatar" }, /invalid avatar storage reference/],
    ["non-HTTPS avatar URL", { avatarUrl: "http://artist.example/avatar.webp" }, /invalid avatar URL/],
  ])("rejects a reviewed profile with a %s", async (_label, avatar, message) => {
    const { ctx, insert } = mutationContext();

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: false,
        entries: [
          {
            outcome: "reviewed-new",
            creatorName: "New Artist",
            creatorKind: "person",
            expectedAbsent: true,
            profile: profile({
              key: "NEW-ARTIST",
              displayName: "New Artist",
              ...avatar,
            }),
          },
        ],
      }),
    ).rejects.toThrow(message);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a missing storage object before writing", async () => {
    const storageId = "storage-avatar";
    const { ctx, insert } = mutationContext([], {
      storageUrls: { [storageId]: null },
    });

    await expect(importReviewedProfilePlanHandler(ctx, {
      operationId: "replication-index-2026-08-30",
      dryRun: false,
      entries: [{
        outcome: "reviewed-new",
        creatorName: "New Artist",
        creatorKind: "person",
        expectedAbsent: true,
        profile: profile({
          key: "NEW-ARTIST",
          displayName: "New Artist",
          avatarStorageId: storageId,
        }),
      }],
    })).rejects.toThrow(/unresolved policy or avatar gates/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns a typed dry-run block for an unverified avatar reference", async () => {
    const { ctx, insert, patch } = mutationContext();

    await expect(importReviewedProfilePlanHandler(ctx, {
      operationId: "replication-index-2026-08-30",
      dryRun: true,
      entries: [{
        outcome: "reviewed-new",
        creatorName: "New Artist",
        creatorKind: "person",
        expectedAbsent: true,
        profile: profile({
          key: "NEW-ARTIST",
          displayName: "New Artist",
          avatarStorageId: "missing-storage-avatar",
        }),
      }],
    })).resolves.toMatchObject({
      blocked: 1,
      rows: [{
        action: "blocked",
        blockReason: "avatar-unverified",
        key: "NEW-ARTIST",
      }],
    });
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("returns a typed dry-run block while trusted R2 verification is unavailable", async () => {
    const avatarR2Key =
      "media/sha256/ab/ab00000000000000000000000000000000000000000000000000000000000000.webp";
    const { ctx, insert, patch } = mutationContext();

    await expect(importReviewedProfilePlanHandler(ctx, {
      operationId: "replication-index-2026-08-30",
      dryRun: true,
      entries: [{
        outcome: "reviewed-new",
        creatorName: "New Artist",
        creatorKind: "person",
        expectedAbsent: true,
        profile: profile({
          key: "NEW-ARTIST",
          displayName: "New Artist",
          avatarR2Key,
        }),
      }],
    })).resolves.toMatchObject({
      blocked: 1,
      rows: [{
        action: "blocked",
        blockReason: "avatar-r2-verification-unavailable",
        key: "NEW-ARTIST",
      }],
    });
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("rejects an R2 avatar write while trusted verification is unavailable", async () => {
    const avatarR2Key =
      "media/sha256/ab/ab00000000000000000000000000000000000000000000000000000000000000.webp";
    const { ctx, insert } = mutationContext();

    await expect(importReviewedProfilePlanHandler(ctx, {
      operationId: "replication-index-2026-08-30",
      dryRun: false,
      entries: [{
        outcome: "reviewed-new",
        creatorName: "New Artist",
        creatorKind: "person",
        expectedAbsent: true,
        profile: profile({
          key: "NEW-ARTIST",
          displayName: "New Artist",
          avatarR2Key,
        }),
      }],
    })).rejects.toThrow(/unresolved policy or avatar gates/);
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([
    ["collective-or-tradition", "collective-or-tradition"],
    ["system-or-process", "system-or-process"],
    ["ambiguous", "ambiguous"],
    ["unverified", "person"],
    ["unknown-artist", "unknown"],
  ] as const)("records %s outcomes without creating a profile", async (outcome, creatorKind) => {
    const { ctx, insert, patch } = mutationContext();

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: false,
        entries: [
          {
            outcome,
            creatorName: `Reviewed ${outcome}`,
            creatorKind,
          },
        ],
      }),
    ).resolves.toMatchObject({ skipped: 1, created: 0, updated: 0 });
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("never creates a profile for an Unknown Artist outcome", async () => {
    const { ctx, insert } = mutationContext();

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: false,
        entries: [
          {
            outcome: "reviewed-new",
            creatorName: "Unknown Artist",
            creatorKind: "person",
            expectedAbsent: true,
            profile: profile({
              key: "UNKNOWN-ARTIST",
              displayName: "Unknown Artist",
            }),
          },
        ],
      }),
    ).rejects.toThrow(/cannot create or update a contributor profile/);
    expect(insert).not.toHaveBeenCalled();
  });
});
