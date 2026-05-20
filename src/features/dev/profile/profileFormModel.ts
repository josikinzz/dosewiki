import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { SaveProfileResult } from "@/hooks/useApiMutations";

import { MAX_BIO_LENGTH, MAX_LINKS, type ProfileFormLink, type ProfileFormState } from "./types";

export type NormalizedProfileFormState = {
  displayName: string;
  avatarUrl: string;
  bio: string;
  links: ProfileFormLink[];
};

export type ProfileFormValidation = {
  bioLength: number;
  hasPartialLink: boolean;
  bioExceedsLimit: boolean;
};

export const toProfileFormState = (profile: NormalizedUserProfile): ProfileFormState => ({
  displayName: profile.displayName,
  avatarUrl: profile.avatarUrl ?? "",
  bio: profile.bio,
  links: profile.links.map((link) => ({ ...link })),
});

export const normalizeProfileFormState = (form: ProfileFormState): NormalizedProfileFormState => ({
  displayName: form.displayName.trim(),
  avatarUrl: form.avatarUrl.trim(),
  bio: form.bio.replace(/\r\n/g, "\n"),
  links: form.links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.label.length > 0 && link.url.length > 0)
    .slice(0, MAX_LINKS),
});

export const getProfileFormValidation = (form: ProfileFormState): ProfileFormValidation => {
  const normalizedForm = normalizeProfileFormState(form);
  return {
    bioLength: normalizedForm.bio.length,
    hasPartialLink: form.links.some((link) => {
      const label = link.label.trim();
      const url = link.url.trim();
      return (label.length > 0 && url.length === 0) || (url.length > 0 && label.length === 0);
    }),
    bioExceedsLimit: normalizedForm.bio.length > MAX_BIO_LENGTH,
  };
};

export const isProfileFormDirty = ({
  profile,
  form,
  hasAvatarUpload,
}: {
  profile: NormalizedUserProfile;
  form: ProfileFormState;
  hasAvatarUpload: boolean;
}) => {
  const normalizedForm = normalizeProfileFormState(form);
  const baseline = normalizeProfileFormState(toProfileFormState(profile));

  return JSON.stringify(normalizedForm) !== JSON.stringify(baseline) || hasAvatarUpload;
};

export const getAvatarUrlSaveValue = ({
  normalizedForm,
  hasAvatarUpload,
}: {
  normalizedForm: NormalizedProfileFormState;
  hasAvatarUpload: boolean;
}) => {
  if (hasAvatarUpload) {
    return undefined;
  }

  return normalizedForm.avatarUrl.length > 0 ? normalizedForm.avatarUrl : null;
};

export const normalizeSavedProfile = ({
  currentProfile,
  normalizedForm,
  result,
}: {
  currentProfile: NormalizedUserProfile;
  normalizedForm: NormalizedProfileFormState;
  result: SaveProfileResult;
}): NormalizedUserProfile => {
  if (result.profile) {
    return result.profile;
  }

  return {
    ...currentProfile,
    displayName: normalizedForm.displayName,
    bio: normalizedForm.bio,
    links: normalizedForm.links,
    avatarUrl: result.avatarUrl ?? (normalizedForm.avatarUrl.length > 0 ? normalizedForm.avatarUrl : null),
    aliases: currentProfile.aliases,
    hasCustomBio: normalizedForm.bio.trim().length > 0,
  };
};
