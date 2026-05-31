import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildStoredProfile,
  canEditContributorProfile,
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
