import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Icon } from "../../common/Icon";

import { SectionCard } from "../../common/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { AvatarUpload } from "./AvatarUpload";
import { LinkManager } from "./LinkManager";
import { BioEditor } from "./BioEditor";
import { toFormState, normalizeFormState, formatFileSize, inferAvatarMimeType } from "./utils.tsx";
import { useSaveProfileMutation } from "../../../hooks/useApiMutations";
import {
  MAX_BIO_LENGTH,
  MAX_LINKS,
  MAX_AVATAR_BYTES,
  ALLOWED_AVATAR_MIME_TYPES,
  type ChangeNotice,
  type ProfileFormLink,
  type ProfileFormState,
  type ProfileEditorTabProps,
} from "./types";

export function ProfileEditorTab({
  profile,
  profileHistory: _profileHistory,
  verifyCredentials,
  onProfileUpdated,
  hasStoredCredentials,
}: ProfileEditorTabProps) {
  const [form, setForm] = useState<ProfileFormState>(() => toFormState(profile));
  const [notice, setNotice] = useState<ChangeNotice | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const saveProfileMutation = useSaveProfileMutation();
  const isSaving = saveProfileMutation.isPending;
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setForm(toFormState(profile));
    setAvatarFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [profile]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [avatarFile]);

  const normalizedForm = useMemo(() => normalizeFormState(form), [form]);
  const baseline = useMemo(() => normalizeFormState(toFormState(profile)), [profile]);
  const isDirty = useMemo(() => {
    if (JSON.stringify(normalizedForm) !== JSON.stringify(baseline)) {
      return true;
    }
    return avatarFile !== null;
  }, [avatarFile, baseline, normalizedForm]);

  const bioLength = normalizedForm.bio.length;
  const hasPartialLink = useMemo(
    () =>
      form.links.some((link) => {
        const label = link.label.trim();
        const url = link.url.trim();
        return (label.length > 0 && url.length === 0) || (url.length > 0 && label.length === 0);
      }),
    [form.links],
  );

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

  const handleLinkChange = (index: number, field: keyof ProfileFormLink, value: string) => {
    setForm((previous) => {
      const nextLinks = [...previous.links];
      nextLinks[index] = { ...nextLinks[index], [field]: value };
      return { ...previous, links: nextLinks };
    });
  };

  const handleRemoveLink = (index: number) => {
    setForm((previous) => {
      const nextLinks = previous.links.filter((_, linkIndex) => linkIndex !== index);
      return { ...previous, links: nextLinks };
    });
  };

  const handleAddLink = () => {
    setForm((previous) => {
      if (previous.links.length >= MAX_LINKS) {
        return previous;
      }
      return {
        ...previous,
        links: [...previous.links, { label: "", url: "" }],
      };
    });
  };

  const handleAvatarUploadClick = useCallback(() => {
    setNotice(null);
    fileInputRef.current?.click();
  }, []);

  const handleAvatarFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file) {
        return;
      }

      const inferredMimeType = inferAvatarMimeType(file);
      if (!inferredMimeType || !ALLOWED_AVATAR_MIME_TYPES.has(inferredMimeType)) {
        setNotice({ type: "error", message: "Avatar must be a PNG or JPG image." });
        return;
      }

      if (file.size > MAX_AVATAR_BYTES) {
        setNotice({
          type: "error",
          message: `Avatar image exceeds ${formatFileSize(MAX_AVATAR_BYTES)} limit. Select a smaller file.`,
        });
        return;
      }

      setAvatarFile(file);
      setNotice({ type: "success", message: "Avatar ready to upload. Save to publish." });
    },
    [],
  );

  const handleClearAvatarSelection = useCallback(() => {
    setAvatarFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setNotice({ type: "success", message: "Avatar upload cleared." });
  }, []);

  const handleRemoveAvatar = useCallback(() => {
    setAvatarFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setForm((previous) => ({ ...previous, avatarUrl: "" }));
    setNotice({ type: "success", message: "Avatar removed. Save to publish." });
  }, []);

  const readFileAsBase64 = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unable to read image file."));
          return;
        }
        const commaIndex = result.indexOf(",");
        const base64 = commaIndex === -1 ? result : result.slice(commaIndex + 1);
        resolve(base64.trim());
      };
      reader.onerror = () => {
        reject(new Error("Failed to read image file."));
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleReset = () => {
    setForm(toFormState(profile));
    setAvatarFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setNotice({ type: "success", message: "Profile form reset." });
  };

  const handleSave = async () => {
    setNotice(null);

    if (!hasStoredCredentials) {
      setNotice({ type: "error", message: "Save your credentials above before editing your profile." });
      return;
    }

    if (!isDirty) {
      setNotice({ type: "success", message: "No changes to save." });
      return;
    }

    if (bioLength > MAX_BIO_LENGTH) {
      setNotice({ type: "error", message: `Bio exceeds ${MAX_BIO_LENGTH} character limit.` });
      return;
    }

    if (hasPartialLink) {
      setNotice({ type: "error", message: "Complete link label and URL fields or remove the incomplete entry." });
      return;
    }

    try {
      setNotice({ type: "success", message: "Verifying credentials…" });
      const credentials = await verifyCredentials();
      setNotice({ type: "success", message: "Preparing profile update…" });

      let avatarUploadPayload: { filename: string; mimeType: string; base64: string } | undefined;
      if (avatarFile) {
        const inferredMimeType = inferAvatarMimeType(avatarFile);
        if (!inferredMimeType) {
          setNotice({ type: "error", message: "Avatar must be a PNG or JPG image." });
          return;
        }

        setNotice({ type: "success", message: "Preparing avatar upload…" });
        const base64 = await readFileAsBase64(avatarFile);
        avatarUploadPayload = {
          filename: avatarFile.name,
          mimeType: inferredMimeType,
          base64,
        };
      }

      setNotice({ type: "success", message: "Saving profile…" });

      const result = await saveProfileMutation.mutateAsync({
        username: credentials.username,
        password: credentials.password,
        profile: {
          key: profile.key,
          displayName: normalizedForm.displayName,
          bio: normalizedForm.bio,
          links: normalizedForm.links,
          avatarUrl: !avatarFile && normalizedForm.avatarUrl.length > 0 ? normalizedForm.avatarUrl : undefined,
        },
        avatarUpload: avatarUploadPayload,
      });

      if (result.unchanged) {
        setNotice({ type: "success", message: "Profile already up to date." });
        return;
      }

      // Use profile from API response if available, otherwise construct from form
      const updatedProfile = result.profile ?? {
        ...profile,
        displayName: normalizedForm.displayName,
        bio: normalizedForm.bio,
        links: normalizedForm.links,
        avatarUrl: result.avatarUrl ?? normalizedForm.avatarUrl ?? null,
        aliases: profile.aliases,
        hasCustomBio: normalizedForm.bio.trim().length > 0,
      };

      onProfileUpdated(updatedProfile, credentials.key);
      setForm(toFormState(updatedProfile));
      setAvatarFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setNotice({ type: "success", message: "Profile saved successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save profile.";
      setNotice({ type: "error", message });
    }
  };

  return (
    <div className="mt-12">
      <SectionCard className="space-y-6 bg-white/[0.035]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Profile</p>
            <h2 className="text-lg font-semibold text-fuchsia-200">Edit contributor bio</h2>
            <p className="mt-2 text-sm text-white/65">
              Update your public profile copy, avatar, and external links. Markdown is supported in the bio field.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <a
              href={`#/contributors/${profile.key}`}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 bg-gradient-to-r from-white/15 via-white/10 to-white/5 text-xs font-medium text-white/75 shadow-sm shadow-fuchsia-500/15 ring-1 ring-white/20 transition hover:text-white hover:ring-white/35"
            >
              <Icon icon="lucide:external-link" size={14} />
              View public profile
            </a>
            <Icon icon="lucide:user-round" className="hidden h-10 w-10 text-fuchsia-200/80 sm:block" size={40} />
          </div>
        </div>

        {notice && (
          <Alert variant={notice.type === "error" ? "destructive" : "success"}>
            <AlertDescription>{notice.message}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="profile-display-name">
              Display name
            </Label>
            <Input
              id="profile-display-name"
              type="text"
              value={form.displayName}
              onChange={(event) => setForm((previous) => ({ ...previous, displayName: event.target.value }))}
              placeholder="Contributor name"
            />
          </div>

          <AvatarUpload
            avatarPreviewSource={avatarPreviewSource}
            avatarInitials={avatarInitials}
            avatarSelectionSummary={avatarSelectionSummary}
            avatarFile={avatarFile}
            trimmedAvatarUrl={trimmedAvatarUrl}
            onUploadClick={handleAvatarUploadClick}
            onClearSelection={handleClearAvatarSelection}
            onRemoveAvatar={handleRemoveAvatar}
            fileInputRef={fileInputRef}
            onFileChange={handleAvatarFileChange}
            avatarUrl={form.avatarUrl}
            onAvatarUrlChange={(value) => setForm((previous) => ({ ...previous, avatarUrl: value }))}
          />

          <BioEditor
            bio={form.bio}
            onBioChange={(value) => setForm((previous) => ({ ...previous, bio: value }))}
            bioLength={bioLength}
          />

          <LinkManager
            links={form.links}
            onLinkChange={handleLinkChange}
            onRemoveLink={handleRemoveLink}
            onAddLink={handleAddLink}
            hasPartialLink={hasPartialLink}
          />
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty || !hasStoredCredentials}
          >
            <Icon icon="lucide:save" size={16} />
            Save profile
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleReset}
            disabled={isSaving || !isDirty}
          >
            <Icon icon="lucide:refresh-cw" size={16} />
            Reset changes
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
