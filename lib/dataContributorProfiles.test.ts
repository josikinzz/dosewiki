import { describe, expect, it } from "vitest";
import {
  buildStoredProfile,
  canEditContributorProfile,
  type StoredProfile,
} from "../server/lib/contributorProfiles";

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
});
