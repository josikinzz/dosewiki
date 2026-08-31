import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildImportedStoredProfile,
  buildStoredProfile,
  canEditContributorProfile,
  contributorReviewerEmails,
  materializeProfile,
  resolveOwnedProfileKey,
  type StoredProfile,
} from "../convex/lib/contributorProfiles";

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

describe("Convex contributor profile identity", () => {
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

  it("allows editor and admin edits regardless of membership email", () => {
    for (const role of ["editor", "admin"] as const) {
      expect(
        canEditContributorProfile({
          actorEmail: "other@example.com",
          actorRole: role,
          targetKey: "EDITOR",
          existingProfile: baseProfile,
        }),
      ).toBe(true);
    }
  });

  it("keeps target key resolution inside the Convex identity module", () => {
    expect(resolveOwnedProfileKey("", "local.user@example.com")).toBe("LOCALUSER");
    expect(resolveOwnedProfileKey(" public-key ", "local.user@example.com")).toBe("PUBLIC-KEY");
  });
});

describe("contributorReviewerEmails", () => {
  it("claims the membership email and the legacy credential emails of key and aliases", () => {
    const emails = contributorReviewerEmails({
      key: "LYREA",
      aliases: ["witchy", "lyrea"],
      membershipEmail: "Lyrea@Example.com",
    });

    // The legacy `witchy@local.dose.wiki` review stamps resolve to LYREA
    // through the alias.
    expect([...emails].sort()).toEqual([
      "lyrea@example.com",
      "lyrea@local.dose.wiki",
      "witchy@local.dose.wiki",
    ]);
  });

  it("claims a scrubbed legacy-group handle without a stored alias", () => {
    // Prod scrubbed "witchy" from LYREA's stored aliases (unauthenticated
    // profile reads ship aliases verbatim), so the claim must come from
    // LEGACY_CONTRIBUTOR_HANDLE_GROUPS — otherwise the 141 completed reviews
    // stamped witchy@local.dose.wiki credit nobody on the About roster.
    const emails = contributorReviewerEmails({
      key: "LYREA",
      aliases: ["lyrea"],
      membershipEmail: undefined,
    });

    expect([...emails].sort()).toEqual([
      "lyrea@local.dose.wiki",
      "witchy@local.dose.wiki",
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

describe("Convex contributor profile role field", () => {
  const storage = { storage: { getUrl: async () => null } };

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

  it("patches the role in bulkImport so merged rows control the stored title", () => {
    const source = readFileSync(join(process.cwd(), "convex/contributorProfiles.ts"), "utf8");
    expect(source).toContain("role: data.role,");
  });

  it("clears a prior R2 avatar when bulkImport replaces profile media", () => {
    const source = readFileSync(join(process.cwd(), "convex/contributorProfiles.ts"), "utf8");
    expect(source).toContain("avatarR2Key: undefined,");
  });
});

describe("Convex contributor profile ownership boundary", () => {
  const readSource = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");
  const exportedPublicMutations = (relativePath: string) => {
    const source = readSource(relativePath);
    return Array.from(source.matchAll(/export const (\w+) = mutation/g), (match) => match[1]);
  };

  it("keeps profile save, rename, and report retargeting under contributorProfiles", () => {
    expect(exportedPublicMutations("convex/contributorProfiles.ts")).toEqual(
      expect.arrayContaining(["saveProfile", "renameKey", "retargetTripReportsToContributor"]),
    );
  });

  it("does not expose duplicate profile save or rename mutations from authorAttribution", () => {
    expect(exportedPublicMutations("convex/authorAttribution.ts")).not.toEqual(
      expect.arrayContaining(["saveContributorProfile", "renamePublicProfileKey"]),
    );
  });

  it("keeps profile rename wired to trip report retargeting", () => {
    const source = readSource("convex/contributorProfiles.ts");

    expect(source).toContain("const reportsUpdated = await patchReportsForContributorKey");
    expect(source).toContain("profile_key: normalizedContributorKey");
  });
});
