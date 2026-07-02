import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { useDevNoticeChannel } from "@/features/dev/notices/devNoticeLifecycle";
import { useSaveProfileMutation } from "@/hooks/useApiMutations";

import {
  browserAvatarFileAdapter,
  createAvatarPreviewSession,
  createAvatarUploadPayload,
  validateAvatarFile,
  type AvatarBrowserFileAdapter,
} from "./avatarUploadModel";
import {
  getAvatarUrlSaveValue,
  getProfileFormValidation,
  isProfileFormDirty,
  normalizeProfileFormState,
  normalizeSavedProfile,
  toProfileFormState,
} from "./profileFormModel";
import { invokeVerifiedProfileSave, verifyProfileSaveCredentials, type ProfileSaveMutation } from "./profileSaveAdapter";
import { MAX_BIO_LENGTH, MAX_LINKS, type ChangeNotice, type ProfileEditorTabProps, type ProfileFormLink } from "./types";
import { formatFileSize } from "./utils.tsx";

export type UseProfileEditorModelOptions = {
  profile: NormalizedUserProfile;
  verifyCredentials: ProfileEditorTabProps["verifyCredentials"];
  onProfileUpdated: ProfileEditorTabProps["onProfileUpdated"];
  hasStoredCredentials: boolean;
  fileAdapter?: AvatarBrowserFileAdapter<File>;
  saveProfile?: ProfileSaveMutation;
  isSavingOverride?: boolean;
};

export function useProfileEditorModel({
  profile,
  verifyCredentials,
  onProfileUpdated,
  hasStoredCredentials,
  fileAdapter = browserAvatarFileAdapter,
  saveProfile,
  isSavingOverride,
}: UseProfileEditorModelOptions) {
  const [form, setForm] = useState(() => toProfileFormState(profile));
  const noticeChannel = useDevNoticeChannel("profile");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const saveProfileMutation = useSaveProfileMutation();
  const saveProfileCommand = saveProfile ?? saveProfileMutation.mutateAsync;
  const isSaving = isSavingOverride ?? saveProfileMutation.isPending;
  const notice: ChangeNotice | null = noticeChannel.notice
    ? {
        type: noticeChannel.notice.status,
        message: noticeChannel.notice.message,
      }
    : null;
  const setNotice = useCallback(
    (next: ChangeNotice | null) => {
      if (!next) {
        noticeChannel.clear();
        return;
      }
      noticeChannel.publish({
        status: next.type,
        message: next.message,
      });
    },
    [noticeChannel],
  );

  // The profile prop is fed by a live Convex subscription, so it can change
  // identity mid-edit (fallback → fetched, or a remote write). Only hard-reset
  // when the profile key changes or the user has no unsaved edits.
  const isDirtyRef = useRef(false);
  const profileKeyRef = useRef(profile.key);
  useEffect(() => {
    const keyChanged = profileKeyRef.current !== profile.key;
    profileKeyRef.current = profile.key;
    if (!keyChanged && isDirtyRef.current) {
      return;
    }
    setForm(toProfileFormState(profile));
    setAvatarFile(null);
  }, [profile]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const preview = createAvatarPreviewSession(avatarFile, fileAdapter);
    setAvatarPreviewUrl(preview.source);

    return preview.dispose;
  }, [avatarFile, fileAdapter]);

  const normalizedForm = useMemo(() => normalizeProfileFormState(form), [form]);
  const validation = useMemo(() => getProfileFormValidation(form), [form]);
  const isDirty = useMemo(
    () => isProfileFormDirty({ profile, form, hasAvatarUpload: avatarFile !== null }),
    [avatarFile, form, profile],
  );
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);
  const trimmedAvatarUrl = form.avatarUrl.trim();
  const avatarPreviewSource = avatarPreviewUrl ?? (trimmedAvatarUrl.length > 0 ? trimmedAvatarUrl : null);
  const avatarInitials = useMemo(() => {
    const basis = (form.displayName || profile.displayName || profile.key).trim();
    if (!basis) {
      return profile.key.slice(0, 2).toUpperCase();
    }

    const initials = basis
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment.charAt(0).toUpperCase())
      .join("");

    return initials || profile.key.slice(0, 2).toUpperCase();
  }, [form.displayName, profile.displayName, profile.key]);
  const avatarSelectionSummary = avatarFile
    ? `${avatarFile.name} • ${formatFileSize(avatarFile.size)}`
    : trimmedAvatarUrl.length > 0
      ? "Using current image"
      : null;

  const changeDisplayName = useCallback((displayName: string) => {
    setForm((previous) => ({ ...previous, displayName }));
  }, []);

  const changeAvatarUrl = useCallback((avatarUrl: string) => {
    setForm((previous) => ({ ...previous, avatarUrl }));
  }, []);

  const changeBio = useCallback((bio: string) => {
    setForm((previous) => ({ ...previous, bio }));
  }, []);

  const changeLink = useCallback((index: number, field: keyof ProfileFormLink, value: string) => {
    setForm((previous) => {
      const nextLinks = [...previous.links];
      nextLinks[index] = { ...nextLinks[index], [field]: value };
      return { ...previous, links: nextLinks };
    });
  }, []);

  const removeLink = useCallback((index: number) => {
    setForm((previous) => ({
      ...previous,
      links: previous.links.filter((_, linkIndex) => linkIndex !== index),
    }));
  }, []);

  const addLink = useCallback(() => {
    setForm((previous) => {
      if (previous.links.length >= MAX_LINKS) {
        return previous;
      }

      return {
        ...previous,
        links: [...previous.links, { label: "", url: "" }],
      };
    });
  }, []);

  const selectAvatarFile = useCallback((file: File | null) => {
    setNotice(null);
    if (!file) {
      return;
    }

    const validationResult = validateAvatarFile(file);
    if (validationResult.ok === false) {
      setNotice({ type: "error", message: validationResult.message });
      return;
    }

    setAvatarFile(file);
    setNotice({ type: "success", message: "Avatar ready to upload. Save to publish." });
  }, []);

  const clearAvatarSelection = useCallback(() => {
    setAvatarFile(null);
    setNotice({ type: "success", message: "Avatar upload cleared." });
  }, []);

  const removeAvatar = useCallback(() => {
    setAvatarFile(null);
    setForm((previous) => ({ ...previous, avatarUrl: "" }));
    setNotice({ type: "success", message: "Avatar removed. Save to publish." });
  }, []);

  const reset = useCallback(() => {
    setForm(toProfileFormState(profile));
    setAvatarFile(null);
    setNotice({ type: "success", message: "Profile form reset." });
  }, [profile]);

  const save = useCallback(async () => {
    setNotice(null);

    if (!hasStoredCredentials) {
      setNotice({ type: "error", message: "Sign in before editing your profile." });
      return;
    }

    if (!isDirty) {
      setNotice({ type: "success", message: "No changes to save." });
      return;
    }

    if (validation.bioExceedsLimit) {
      setNotice({ type: "error", message: `Bio exceeds ${MAX_BIO_LENGTH} character limit.` });
      return;
    }

    if (validation.hasPartialLink) {
      setNotice({ type: "error", message: "Complete link label and URL fields or remove the incomplete entry." });
      return;
    }

    try {
      setNotice({ type: "pending", message: "Verifying credentials…" });
      const credentials = await verifyProfileSaveCredentials(verifyCredentials);
      setNotice({ type: "pending", message: "Preparing profile update…" });

      let avatarUploadPayload;
      if (avatarFile) {
        setNotice({ type: "pending", message: "Preparing avatar upload…" });
        avatarUploadPayload = await createAvatarUploadPayload(avatarFile, fileAdapter);
      }

      setNotice({ type: "pending", message: "Saving profile…" });

      const result = await invokeVerifiedProfileSave({
        credentials,
        saveProfile: saveProfileCommand,
        payload: {
          profile: {
            key: profile.key,
            displayName: normalizedForm.displayName,
            bio: normalizedForm.bio,
            links: normalizedForm.links,
            avatarUrl: getAvatarUrlSaveValue({ normalizedForm, hasAvatarUpload: avatarFile !== null }),
          },
          avatarUpload: avatarUploadPayload,
        },
      });

      if (result.unchanged) {
        setNotice({ type: "success", message: "Profile already up to date." });
        return;
      }

      const updatedProfile = normalizeSavedProfile({
        currentProfile: profile,
        normalizedForm,
        result,
      });

      onProfileUpdated(updatedProfile, updatedProfile.key);
      setForm(toProfileFormState(updatedProfile));
      setAvatarFile(null);
      setNotice({ type: "success", message: "Profile saved successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save profile.";
      setNotice({ type: "error", message });
    }
  }, [
    avatarFile,
    fileAdapter,
    hasStoredCredentials,
    isDirty,
    normalizedForm,
    onProfileUpdated,
    profile,
    saveProfileCommand,
    validation.bioExceedsLimit,
    validation.hasPartialLink,
    verifyCredentials,
  ]);

  return {
    form,
    notice,
    avatarFile,
    avatarPreviewSource,
    avatarInitials,
    avatarSelectionSummary,
    trimmedAvatarUrl,
    bioLength: validation.bioLength,
    hasPartialLink: validation.hasPartialLink,
    isDirty,
    isSaving,
    commands: {
      changeDisplayName,
      changeAvatarUrl,
      changeBio,
      changeLink,
      removeLink,
      addLink,
      selectAvatarFile,
      clearAvatarSelection,
      removeAvatar,
      reset,
      save,
      clearNotice: () => setNotice(null),
    },
  };
}
