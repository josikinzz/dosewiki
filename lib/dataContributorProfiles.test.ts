import { afterAll, afterEach, describe, expect, it } from "vitest";
import { bulkImport, renameKey } from "../server/contributorProfiles";
import {
  buildImportedStoredProfile,
  buildStoredProfile,
  canEditContributorProfile,
  contributorReviewerEmails,
  materializeProfile,
  resolveOwnedProfileKey,
  type StoredProfile,
} from "../server/lib/contributorProfiles";
import { admin, createCtx } from "./changeProposalReviewFixture";

process.env.LEGACY_CONTRIBUTOR_HANDLE_GROUPS = "LYREA,OLDHANDLE";
afterAll(() => {
  delete process.env.LEGACY_CONTRIBUTOR_HANDLE_GROUPS;
});

// Postgres registered functions keep the original handler on `_handler`; there is
// no in-repo Postgres runtime harness, so the handler is exercised directly.
const handlerOf = (fn: unknown) =>
  (fn as { _handler: (ctx: never, args: unknown) => Promise<unknown> })._handler;

/** The shared fake db plus the `storage.getUrl` the profile materializer reads. */
function createAdminCtx(seed: Parameters<typeof createCtx>[0]) {
  const { ctx, rowsOf } = createCtx({ memberships: [admin], ...seed });
  return { ctx: { ...ctx, storage: { getUrl: async () => null } } as never, rowsOf };
}

const baseProfile: StoredProfile = {
  key: "EDITOR",
  displayName: "Editor",
  aliases: [],
  bio: "",
  links: [],
  membershipEmail: "editor@example.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Postgres contributor profile identity", () => {
  it("claims an unclaimed profile when the derived actor key matches", () => {
    expect(
      canEditContributorProfile({
        actorEmail: "editor@example.com",
        actorRole: "viewer",
        targetKey: "EDITOR",
        existingProfile: { ...baseProfile, membershipEmail: undefined },
      }),
    ).toBe(true);

    const stored = buildStoredProfile(
      {
        key: "",
        displayName: "Editor",
        bio: "Bio",
        links: [],
      },
      null,
      "editor@example.com",
      "viewer",
    );

    expect(stored.key).toBe("EDITOR");
    expect(stored.membershipEmail).toBe("editor@example.com");
  });

  it("rejects a claimed profile owned by another member", () => {
    expect(
      canEditContributorProfile({
        actorEmail: "other@example.com",
        actorRole: "viewer",
        targetKey: "EDITOR",
        existingProfile: baseProfile,
      }),
    ).toBe(false);
  });

  it("rejects a viewer claiming a profile key that does not belong to their email", () => {
    expect(
      canEditContributorProfile({
        actorEmail: "viewer@example.com",
        actorRole: "viewer",
        targetKey: "EDITOR",
        existingProfile: null,
      }),
    ).toBe(false);
  });

  it("lets an admin edit any profile regardless of membership email", () => {
    expect(
      canEditContributorProfile({
        actorEmail: "other@example.com",
        actorRole: "admin",
        targetKey: "EDITOR",
        existingProfile: baseProfile,
      }),
    ).toBe(true);
  });

  it("holds an editor to their own profile", () => {
    expect(
      canEditContributorProfile({
        actorEmail: "other@example.com",
        actorRole: "editor",
        targetKey: "EDITOR",
        existingProfile: baseProfile,
      }),
    ).toBe(false);
    expect(
      canEditContributorProfile({
        actorEmail: "editor@example.com",
        actorRole: "editor",
        targetKey: "EDITOR",
        existingProfile: baseProfile,
      }),
    ).toBe(true);
  });

  it("claims the record for an editor's first self-serve save, and never rebinds another's", () => {
    const claimed = buildStoredProfile(
      { key: "", displayName: "Editor", bio: "", links: [] },
      null,
      "editor@example.com",
      "editor",
    );
    expect(claimed.membershipEmail).toBe("editor@example.com");

    const kept = buildStoredProfile(
      { key: "EDITOR", displayName: "Editor", bio: "", links: [] },
      baseProfile,
      "admin@example.com",
      "admin",
    );
    expect(kept.membershipEmail).toBe("editor@example.com");
  });

  it("keeps target key resolution inside the Postgres identity module", () => {
    expect(resolveOwnedProfileKey("", "local.user@example.com")).toBe("LOCALUSER");
    expect(resolveOwnedProfileKey(" public-key ", "local.user@example.com")).toBe("PUBLIC-KEY");
  });
});

describe("contributorReviewerEmails", () => {
  it("claims the membership email and the legacy credential emails of key and aliases", () => {
    const emails = contributorReviewerEmails({
      key: "LYREA",
      aliases: ["oldhandle", "lyrea"],
      membershipEmail: "Lyrea@Example.com",
    });

    // The legacy `oldhandle@local.dose.wiki` review stamps resolve to LYREA
    // through the alias.
    expect([...emails].sort()).toEqual([
      "lyrea@example.com",
      "lyrea@local.dose.wiki",
      "oldhandle@local.dose.wiki",
    ]);
  });

  it("claims a scrubbed legacy-group handle without a stored alias", () => {
    // Prod scrubbed the retired handle from LYREA's stored aliases
    // (unauthenticated profile reads ship aliases verbatim), so the claim must
    // come from LEGACY_CONTRIBUTOR_HANDLE_GROUPS, otherwise the completed
    // reviews stamped under the retired handle credit nobody on the About roster.
    const emails = contributorReviewerEmails({
      key: "LYREA",
      aliases: ["lyrea"],
      membershipEmail: undefined,
    });

    expect([...emails].sort()).toEqual([
      "lyrea@local.dose.wiki",
      "oldhandle@local.dose.wiki",
    ]);
  });

  it("never turns a display-name alias into a credential email", () => {
    const emails = contributorReviewerEmails({
      key: "JOSIE",
      aliases: ["josie kins"],
      membershipEmail: undefined,
    });

    expect(emails).toEqual(new Set(["josie@local.dose.wiki"]));
  });

  it("stays within the internal legacy domain for alias-derived emails", () => {
    const emails = contributorReviewerEmails({
      key: "ADA",
      aliases: ["someoneelse"],
      membershipEmail: undefined,
    });

    for (const email of emails) {
      expect(email.endsWith("@local.dose.wiki")).toBe(true);
    }
  });
});

describe("Postgres contributor profile role field", () => {
  const storage = { storage: { getUrl: async () => null } };

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("round-trips a role from bulk import through the public read", async () => {
    const imported = buildImportedStoredProfile(
      {
        key: "viscid",
        displayName: "Viscid",
        aliases: ["mark gillis"],
        bio: "Legacy bio.",
        role: "  Former   Dev ",
        links: [],
        avatarUrl: "/profile-avatars/viscid/avatar.jpeg",
      },
      "2026-07-27T00:00:00.000Z",
    );

    expect(imported?.key).toBe("VISCID");
    expect(imported?.role).toBe("Former Dev");

    const publicProfile = await materializeProfile(storage, imported as StoredProfile);
    expect(publicProfile.role).toBe("Former Dev");
    expect(publicProfile.aliases).toEqual(["mark gillis"]);
  });

  it("omits the role entirely when the imported row has none", async () => {
    const imported = buildImportedStoredProfile({
      key: "NATALIE",
      displayName: "Natalie",
      bio: "Proofreader bio.",
      links: [],
    });

    expect(imported?.role).toBeUndefined();
    expect((await materializeProfile(storage, imported as StoredProfile)).role).toBeUndefined();
  });

  it("materializes a canonical R2 avatar reference through the configured media base", async () => {
    const previous = process.env.REPLICATION_MEDIA_BASE_URL;
    process.env.REPLICATION_MEDIA_BASE_URL = "https://media.dose.wiki/";
    try {
      const key = "media/sha256/ab/ab00000000000000000000000000000000000000000000000000000000000000.webp";
      const imported: StoredProfile = {
        key: "R2ARTIST",
        displayName: "R2 Artist",
        aliases: [],
        bio: "",
        links: [],
        avatarR2Key: key,
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
      };

      await expect(materializeProfile(storage, imported)).resolves.toMatchObject({
        avatarUrl: `https://media.dose.wiki/${key}`,
      });
    } finally {
      if (previous === undefined) delete process.env.REPLICATION_MEDIA_BASE_URL;
      else process.env.REPLICATION_MEDIA_BASE_URL = previous;
    }
  });

  it("keeps a stored role when the self-serve editor saves without one", () => {
    const existing: StoredProfile = { ...baseProfile, key: "JOSIE", role: "Founder" };

    const saved = buildStoredProfile(
      { key: "JOSIE", displayName: "Josie Kins", bio: "Updated bio", links: [] },
      existing,
      "editor@example.com",
      "editor",
    );

    expect(saved.role).toBe("Founder");
  });

  it("lets an explicit role set or clear the stored title", () => {
    const existing: StoredProfile = { ...baseProfile, key: "JOSIE", role: "Founder" };

    expect(
      buildStoredProfile(
        { key: "JOSIE", displayName: "Josie Kins", bio: "", role: "Project Lead", links: [] },
        existing,
        "editor@example.com",
        "editor",
      ).role,
    ).toBe("Project Lead");

    expect(
      buildStoredProfile(
        { key: "JOSIE", displayName: "Josie Kins", bio: "", role: null, links: [] },
        existing,
        "editor@example.com",
        "editor",
      ).role,
    ).toBeUndefined();
  });

  it("bulkImport replaces role and clears a prior R2 avatar on an existing profile", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const { ctx, rowsOf } = createAdminCtx({
      contributorProfiles: [{
        _id: "p1",
        key: "JOSIE",
        displayName: "Josie",
        aliases: [],
        role: "Old title",
        avatarR2Key: "r2/old.webp",
        bio: "",
        links: [],
      }],
    });

    await handlerOf(bulkImport)(ctx, {
      apiKey: "secret",
      actorEmail: "admin@example.com",
      profiles: [{ key: "JOSIE", displayName: "Josie Kins", role: "Project Lead", bio: "", links: [] }],
    });

    const stored = rowsOf("contributorProfiles").get("p1")!;
    expect(stored.displayName).toBe("Josie Kins");
    expect(stored.role).toBe("Project Lead");
    expect(stored.avatarR2Key).toBeUndefined();
  });
});

describe("Postgres contributor profile rename", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("renameKey retargets stored trip reports to the new key", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const { ctx, rowsOf } = createAdminCtx({
      contributorProfiles: [{ _id: "p1", key: "OLD", displayName: "Old", aliases: [], bio: "", links: [] }],
      tripReports: [
        { _id: "r1", slug: "a", subject: { name: "Old", profile_key: "OLD" }, substances: [], onset: [], peak: [], offset: [], tags: [] },
        { _id: "r2", slug: "b", subject: { name: "Someone else" }, substances: [], onset: [], peak: [], offset: [], tags: [] },
      ],
    });

    const result = (await handlerOf(renameKey)(ctx, {
      apiKey: "secret",
      actorEmail: "admin@example.com",
      fromKey: "OLD",
      toKey: "NEW",
    })) as { reportsUpdated: number };

    expect(result.reportsUpdated).toBe(1);
    expect(rowsOf("contributorProfiles").get("p1")?.key).toBe("NEW");
    expect(rowsOf("tripReports").get("r1")?.subject).toMatchObject({ profile_key: "NEW" });
    expect(rowsOf("tripReports").get("r2")?.subject).not.toHaveProperty("profile_key");
  });
});
