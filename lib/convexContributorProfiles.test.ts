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
