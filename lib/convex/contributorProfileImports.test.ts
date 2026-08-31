import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import { importReviewedProfilePlanHandler } from "../../convex/lib/contributorProfileImports";

const PROFILE_ID = "profile-existing" as Id<"contributorProfiles">;

function profile(overrides: Record<string, unknown> = {}) {
  return {
    key: "ARTIST",
    displayName: "Artist Name",
    aliases: ["artist name"],
    avatarStorageId: null,
    avatarR2Key: null,
    avatarUrl: null,
    bio: "Existing bio",
    role: "Replication Artist",
    links: [],
    ...overrides,
  };
}

function storedProfile(overrides: Record<string, unknown> = {}) {
  const value = profile(overrides);
  return {
    _id: PROFILE_ID,
    _creationTime: 1,
    key: value.key,
    displayName: value.displayName,
    aliases: value.aliases,
    ...(value.avatarStorageId ? { avatarStorageId: value.avatarStorageId } : {}),
    ...(value.avatarR2Key ? { avatarR2Key: value.avatarR2Key } : {}),
    ...(value.avatarUrl ? { avatarUrl: value.avatarUrl } : {}),
    bio: value.bio,
    ...(value.role ? { role: value.role } : {}),
    links: value.links,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function mutationContext(
  initialRows: Record<string, unknown>[] = [],
  options: {
    authenticated?: boolean;
    role?: "admin" | "editor" | "viewer";
    storageUrls?: Record<string, string | null>;
  } = {},
) {
  const rows = [...initialRows];
  const patch = vi.fn(async (id: string, value: Record<string, unknown>) => {
    const row = rows.find((candidate) => candidate._id === id);
    if (row) Object.assign(row, value);
  });
  const insert = vi.fn(async (_table: string, value: Record<string, unknown>) => {
    rows.push({ _id: "profile-created", _creationTime: 2, ...value });
    return "profile-created";
  });
  const query = vi.fn((table: string) => {
    const tableRows = table === "contributorProfiles" ? rows : [];
    return {
      take: async (limit: number) => tableRows.slice(0, limit),
      withIndex: (_index: string, apply: (query: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      let field = "";
      let value: unknown;
      apply({
        eq(nextField, nextValue) {
          field = nextField;
          value = nextValue;
          return this;
        },
      });
      const matches =
        table === "memberships"
          ? [{ email: "editor@example.com", role: options.role ?? "editor" }]
          : rows.filter((row) => row[field] === value);
      return {
        unique: async () => matches[0] ?? null,
        take: async (limit: number) => matches.slice(0, limit),
      };
      },
    };
  });
  const ctx = {
    auth: {
      getUserIdentity: async () =>
        options.authenticated === false
          ? null
          : {
              subject: "editor",
              email: "editor@example.com",
              name: "Editor",
            },
    },
    db: {
      get: vi.fn(async (id: string) => rows.find((row) => row._id === id) ?? null),
      insert,
      patch,
      query,
    },
    storage: {
      getUrl: vi.fn(async (id: string) => options.storageUrls?.[id] ?? null),
    },
  } as unknown as MutationCtx;
  return { ctx, insert, patch, rows };
}

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

  it("rejects an authenticated viewer before projecting the import", async () => {
    const { ctx, insert, patch } = mutationContext([], { role: "viewer" });

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
    ).rejects.toThrow(/Editor access required/);
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
    const previous = process.env.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
    process.env.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE = "profile-import-token";
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
      if (previous === undefined) delete process.env.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
      else process.env.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE = previous;
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
