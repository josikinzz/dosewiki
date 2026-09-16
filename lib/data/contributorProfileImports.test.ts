import { describe, expect, it } from "vitest";

import type { Id } from "@server/postgres/runtime/dataModel";
import { importReviewedProfilePlanHandler } from "../../server/lib/contributorProfileImports";
import { PROFILE_ID, mutationContext, profile, storedProfile } from "./contributorProfileImports.testHarness";

describe("importReviewedProfilePlanHandler", () => {
  it("updates an exact existing-profile match by id after its CAS snapshot agrees", async () => {
    const current = storedProfile();
    const { ctx, patch } = mutationContext([current]);
    const desired = profile({
      links: [{ label: "Official site", url: "https://artist.example/" }],
    });

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: false,
        entries: [
          {
            outcome: "existing-profile",
            creatorName: "Artist Name",
            creatorKind: "person",
            profileId: PROFILE_ID,
            expected: profile(),
            profile: desired,
          },
        ],
      }),
    ).resolves.toMatchObject({ updated: 1, created: 0, unchanged: 0 });
    expect(patch).toHaveBeenCalledWith(PROFILE_ID, expect.objectContaining({ links: desired.links }));
  });

  it("creates a reviewed-new person profile under its stable key", async () => {
    const storageId = "storage-avatar" as Id<"_storage">;
    const { ctx, insert } = mutationContext([], {
      storageUrls: { [storageId]: "https://storage.example/avatar.webp" },
    });
    const desired = profile({
      key: "NEW-ARTIST",
      displayName: "New Artist",
      aliases: ["new artist"],
      avatarStorageId: storageId,
      bio: "Reviewed replication artist.",
      links: [{ label: "Official site", url: "https://new-artist.example/" }],
    });

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
            profile: desired,
          },
        ],
      }),
    ).resolves.toMatchObject({ created: 1, updated: 0, unchanged: 0 });
    expect(insert).toHaveBeenCalledWith(
      "contributorProfiles",
      expect.objectContaining({
        key: "NEW-ARTIST",
        avatarStorageId: storageId,
      }),
    );
  });

  it("keeps the alias-aware collision preflight active beyond the old 500-profile ceiling", async () => {
    const existingRows = Array.from({ length: 501 }, (_, index) => ({
      ...storedProfile({
        key: `EXISTING-${index}`,
        displayName: `Existing ${index}`,
        aliases: [],
      }),
      _id: `profile-${index}`,
    }));
    const { ctx, insert } = mutationContext(existingRows);

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
          aliases: [],
        }),
      }],
    })).resolves.toMatchObject({ created: 1, updated: 0, blocked: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("treats an exact reviewed-new retry as unchanged", async () => {
    const desired = storedProfile({
      key: "NEW-ARTIST",
      displayName: "New Artist",
      aliases: ["new artist"],
      bio: "Reviewed replication artist.",
    });
    const { ctx, insert } = mutationContext([desired]);

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
              aliases: ["new artist"],
              bio: "Reviewed replication artist.",
            }),
          },
        ],
      }),
    ).resolves.toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an existing-profile update when its reviewed snapshot drifted", async () => {
    const { ctx, patch } = mutationContext([storedProfile({ bio: "Changed live bio" })]);

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: false,
        entries: [
          {
            outcome: "existing-profile",
            creatorName: "Artist Name",
            creatorKind: "person",
            profileId: PROFILE_ID,
            expected: profile(),
            profile: profile({ bio: "Reviewed new bio" }),
          },
        ],
      }),
    ).rejects.toThrow(/changed after reviewed preflight/);
    expect(patch).not.toHaveBeenCalled();
  });

  it.each(["viewer", "editor"] as const)("rejects an authenticated %s before projecting the import", async (role) => {
    const { ctx, insert, patch } = mutationContext([], { role });

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: true,
        entries: [
          {
            outcome: "reviewed-new",
            creatorName: "New Artist",
            creatorKind: "person",
            expectedAbsent: true,
            profile: profile({ key: "NEW-ARTIST", displayName: "New Artist" }),
          },
        ],
      }),
    ).rejects.toThrow(/Admin access required/);
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller before projecting the import", async () => {
    const { ctx, insert, patch } = mutationContext([], {
      authenticated: false,
    });

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: true,
        entries: [
          {
            outcome: "reviewed-new",
            creatorName: "New Artist",
            creatorKind: "person",
            expectedAbsent: true,
            profile: profile({ key: "NEW-ARTIST", displayName: "New Artist" }),
          },
        ],
      }),
    ).rejects.toThrow(/Authentication required/);
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("allows the scoped profile-maintenance token to project without an identity", async () => {
    const previous = process.env.DATA_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
    process.env.DATA_ADMIN_TOKEN_PROFILE_MEDIA_WRITE = "profile-import-token";
    const { ctx, insert, patch } = mutationContext([], {
      authenticated: false,
    });

    try {
      await expect(
        importReviewedProfilePlanHandler(ctx, {
          apiKey: "profile-import-token",
          operationId: "replication-index-2026-08-30",
          dryRun: true,
          entries: [
            {
              outcome: "reviewed-new",
              creatorName: "New Artist",
              creatorKind: "person",
              expectedAbsent: true,
              profile: profile({
                key: "NEW-ARTIST",
                displayName: "New Artist",
              }),
            },
          ],
        }),
      ).resolves.toMatchObject({ created: 1, dryRun: true });
    } finally {
      if (previous === undefined) delete process.env.DATA_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
      else process.env.DATA_ADMIN_TOKEN_PROFILE_MEDIA_WRITE = previous;
    }
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("projects reviewed creates in dry-run mode without writing", async () => {
    const { ctx, insert, patch } = mutationContext();

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: true,
        entries: [
          {
            outcome: "reviewed-new",
            creatorName: "New Artist",
            creatorKind: "person",
            expectedAbsent: true,
            profile: profile({ key: "NEW-ARTIST", displayName: "New Artist" }),
          },
        ],
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      created: 1,
      rows: [{ action: "would-create", key: "NEW-ARTIST", profileId: null }],
    });
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("projects reviewed updates in dry-run mode without writing", async () => {
    const { ctx, insert, patch } = mutationContext([storedProfile()]);

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: true,
        entries: [
          {
            outcome: "existing-profile",
            creatorName: "Artist Name",
            creatorKind: "person",
            profileId: PROFILE_ID,
            expected: profile(),
            profile: profile({ bio: "Reviewed new bio" }),
          },
        ],
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      updated: 1,
      rows: [{ action: "would-update", key: "ARTIST", profileId: PROFILE_ID }],
    });
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("rejects duplicate reviewed profiles within one batch before writing", async () => {
    const { ctx, insert, patch } = mutationContext();
    const reviewed = {
      outcome: "reviewed-new" as const,
      creatorName: "New Artist",
      creatorKind: "person" as const,
      expectedAbsent: true as const,
      profile: profile({ key: "NEW-ARTIST", displayName: "New Artist" }),
    };

    await expect(
      importReviewedProfilePlanHandler(ctx, {
        operationId: "replication-index-2026-08-30",
        dryRun: false,
        entries: [reviewed, { ...reviewed, creatorName: "Duplicate Artist" }],
      }),
    ).rejects.toThrow(/batch repeats/);
    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it.each([
    ["key", storedProfile({ key: "NEW-ARTIST", displayName: "Other Artist" })],
    ["name", storedProfile({ key: "OTHER-ARTIST", displayName: "New Artist" })],
    ["case-folded name", storedProfile({ key: "OTHER-ARTIST", displayName: "NEW ARTIST" })],
    ["existing alias", storedProfile({ key: "OTHER-ARTIST", displayName: "Other Artist", aliases: ["new artist"] })],
  ])("rejects a reviewed create that collides by %s", async (_field, collision) => {
    const { ctx, insert } = mutationContext([collision]);

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
            }),
          },
        ],
      }),
    ).rejects.toThrow(/already in use|conflicts with an existing/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects planned profiles whose aliases overlap in the normalized identity space", async () => {
    const { ctx, insert } = mutationContext();

    await expect(importReviewedProfilePlanHandler(ctx, {
      operationId: "replication-index-2026-08-30",
      dryRun: false,
      entries: [
        {
          outcome: "reviewed-new",
          creatorName: "First Artist",
          creatorKind: "person",
          expectedAbsent: true,
          profile: profile({
            key: "FIRST-ARTIST",
            displayName: "First Artist",
            aliases: ["shared credit"],
          }),
        },
        {
          outcome: "reviewed-new",
          creatorName: "Second Artist",
          creatorKind: "person",
          expectedAbsent: true,
          profile: profile({
            key: "SECOND-ARTIST",
            displayName: "Second Artist",
            aliases: ["Shared Credit"],
          }),
        },
      ],
    })).rejects.toThrow(/repeats identity shared credit/);
    expect(insert).not.toHaveBeenCalled();
  });
});
