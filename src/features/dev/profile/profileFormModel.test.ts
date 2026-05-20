import { describe, expect, it } from "vitest";
import type { NormalizedUserProfile } from "@/data/userProfiles";

import {
  getAvatarUrlSaveValue,
  getProfileFormValidation,
  isProfileFormDirty,
  normalizeProfileFormState,
  normalizeSavedProfile,
  toProfileFormState,
} from "./profileFormModel";

const profile = (overrides: Partial<NormalizedUserProfile> = {}): NormalizedUserProfile => ({
  key: "EDITOR",
  displayName: "Editor",
  aliases: ["editor"],
  avatarUrl: "https://example.com/avatar.png",
  bio: "Existing bio",
  links: [{ label: "Site", url: "https://example.com" }],
  hasCustomBio: true,
  ...overrides,
});

describe("profileFormModel", () => {
  it("normalizes editable fields without mutating the source profile", () => {
    const source = profile();
    const form = toProfileFormState(source);
    form.links[0].label = "Changed";

    expect(source.links[0].label).toBe("Site");
    expect(
      normalizeProfileFormState({
        displayName: " Editor ",
        avatarUrl: " https://cdn.example.com/me.png ",
        bio: "Line 1\r\nLine 2",
        links: [
          { label: " Site ", url: " https://example.com " },
          { label: "Partial", url: "" },
        ],
      }),
    ).toEqual({
      displayName: "Editor",
      avatarUrl: "https://cdn.example.com/me.png",
      bio: "Line 1\nLine 2",
      links: [{ label: "Site", url: "https://example.com" }],
    });
  });

  it("detects dirty state, partial links, and bio limit state from normalized form rules", () => {
    const currentProfile = profile();
    const form = toProfileFormState(currentProfile);

    expect(isProfileFormDirty({ profile: currentProfile, form, hasAvatarUpload: false })).toBe(false);
    expect(isProfileFormDirty({ profile: currentProfile, form, hasAvatarUpload: true })).toBe(true);

    const dirtyForm = { ...form, bio: `${form.bio}\r\n` };
    expect(isProfileFormDirty({ profile: currentProfile, form: dirtyForm, hasAvatarUpload: false })).toBe(true);

    expect(
      getProfileFormValidation({
        ...form,
        links: [{ label: "Website", url: "" }],
      }),
    ).toMatchObject({
      hasPartialLink: true,
      bioExceedsLimit: false,
    });
  });

  it("distinguishes avatar removal from avatar upload in save payloads", () => {
    const normalizedForm = normalizeProfileFormState({
      displayName: "Editor",
      avatarUrl: "",
      bio: "",
      links: [],
    });

    expect(getAvatarUrlSaveValue({ normalizedForm, hasAvatarUpload: false })).toBeNull();
    expect(getAvatarUrlSaveValue({ normalizedForm, hasAvatarUpload: true })).toBeUndefined();
  });

  it("builds the next profile from API fallback data when the response omits a profile", () => {
    const currentProfile = profile({ aliases: ["old-alias"] });
    const normalizedForm = normalizeProfileFormState({
      displayName: "New Editor",
      avatarUrl: "",
      bio: "",
      links: [{ label: "Docs", url: "https://docs.example.com" }],
    });

    expect(
      normalizeSavedProfile({
        currentProfile,
        normalizedForm,
        result: { success: true },
      }),
    ).toEqual({
      ...currentProfile,
      displayName: "New Editor",
      avatarUrl: null,
      bio: "",
      links: [{ label: "Docs", url: "https://docs.example.com" }],
      hasCustomBio: false,
    });
  });
});
