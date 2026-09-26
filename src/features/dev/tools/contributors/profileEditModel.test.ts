import { describe, expect, it } from "vitest";

import { toContributorForm, type EditorContributorProfile } from "./contributorsModel";
import {
  canWriteContributorProfile,
  changedProfileParts,
  classifyWriteFailure,
  joinProfileParts,
  linkProblem,
  moveLink,
  profileSaveBlocker,
} from "./profileEditModel";

const profile = (patch: Partial<EditorContributorProfile> = {}): EditorContributorProfile => ({
  key: "ADA",
  displayName: "Ada Lovelace",
  aliases: [],
  bio: "A bio.",
  role: null,
  links: [],
  membershipEmail: null,
  avatarUrl: null,
  avatarStorageId: null,
  storedAvatarUrl: null,
  replicationOrder: [],
  reportOrder: [],
  exclude_from_gallery: false,
  archival: false,
  approved_replicator: false,
  staffNote: null,
  updatedAt: null,
  updatedBy: null,
  ...patch,
});

describe("profile edit model", () => {
  it("names what a link row still needs, and passes a blank or whole one", () => {
    expect(linkProblem({ label: "", url: "" })).toBeNull();
    expect(linkProblem({ label: "Site", url: "https://example.org" })).toBeNull();
    expect(linkProblem({ label: "Site", url: "" })).toMatch(/address/);
    expect(linkProblem({ label: "", url: "https://example.org" })).toMatch(/Name this link/);
    expect(linkProblem({ label: "Site", url: "http://example.org" })).toMatch(/https/);
    expect(linkProblem({ label: "Site", url: "example.org" })).toMatch(/https/);
  });

  it("moves a link without losing the others", () => {
    expect(moveLink(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveLink(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });

  it("blocks Save for one reason at a time", () => {
    const form = toContributorForm(profile());
    expect(profileSaveBlocker(form)).toBeNull();
    expect(profileSaveBlocker({ ...form, displayName: " " })).toMatch(/display name/);
    expect(profileSaveBlocker({ ...form, bio: "x".repeat(4005) })).toMatch(/5 characters over/);
    expect(profileSaveBlocker({ ...form, links: [{ label: "", url: "" }, { label: "Shop", url: "" }] })).toMatch(/^Link 2:/);
  });

  it("lists the changed parts in reading order and joins them as a sentence", () => {
    const saved = profile();
    const form = { ...toContributorForm(saved), bio: "New", displayName: "Ada L." };
    expect(changedProfileParts(saved, form, { picked: false, removed: false })).toEqual(["name", "bio"]);
    expect(changedProfileParts(saved, form, { picked: true, removed: false })[0]).toBe("picture");
    expect(joinProfileParts(["name", "bio", "links"])).toBe("the name, bio and links");
    expect(joinProfileParts(["bio"])).toBe("the bio");
  });

  it("mirrors the server's write rule for records a non-admin may change", () => {
    const viewerEmail = "ada@example.org";
    expect(canWriteContributorProfile({ canApprove: true, viewerEmail, profile: profile({ membershipEmail: "x@y.z" }) })).toBe(true);
    expect(canWriteContributorProfile({ canApprove: false, viewerEmail, profile: profile({ membershipEmail: "ADA@example.org" }) })).toBe(true);
    expect(canWriteContributorProfile({ canApprove: false, viewerEmail, profile: profile({ membershipEmail: "x@y.z" }) })).toBe(false);
    expect(canWriteContributorProfile({ canApprove: false, viewerEmail, profile: profile({ key: "ada" }) })).toBe(true);
    expect(canWriteContributorProfile({ canApprove: false, viewerEmail, profile: profile({ key: "ZED" }) })).toBe(false);
    // Without the viewer's address the route decides, as before.
    expect(canWriteContributorProfile({ canApprove: false, viewerEmail: null, profile: profile({ key: "ZED" }) })).toBe(true);
  });

  it("tells a conflict, the freeze, a refusal and a lost answer apart", () => {
    expect(classifyWriteFailure(409, "Someone saved")).toBe("conflict");
    expect(classifyWriteFailure(503, "Data writes are frozen (DATA_WRITES_FROZEN)")).toBe("frozen");
    expect(classifyWriteFailure(403, "You can only edit your own contributor profile.")).toBe("refused");
    expect(classifyWriteFailure(500, "Unable to save")).toBe("uncertain");
  });
});
