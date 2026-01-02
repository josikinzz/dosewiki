import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { ExternalLink, ImageOff, ImageUp, Plus, RefreshCw, Save, Trash2, UserRound } from "lucide-react";

import { SectionCard } from "../common/SectionCard";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { NormalizedUserProfile } from "../../data/userProfiles";
import type { ChangeLogEntry } from "../../data/changeLog";

const MAX_BIO_LENGTH = 4000;
const MAX_LINKS = 3;
const MAX_AVATAR_BYTES = 1024 * 1024 * 2; // 2 MiB
const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

export type ChangeNotice = {
  type: "success" | "error";
  message: string;
};

type ProfileFormLink = {
  label: string;
  url: string;
};

type ProfileFormState = {
  displayName: string;
  avatarUrl: string;
  bio: string;
  links: ProfileFormLink[];
};

type ProfileEditorTabProps = {
  profile: NormalizedUserProfile;
  profileHistory: ChangeLogEntry[];
  verifyCredentials: (
    options?: { username?: string; password?: string }
  ) => Promise<{ username: string; password: string; key: string }>;
  onProfileUpdated: (profile: NormalizedUserProfile, canonicalKey: string) => void;
  hasStoredCredentials: boolean;
};

const toFormState = (profile: NormalizedUserProfile): ProfileFormState => ({
  displayName: profile.displayName,
  avatarUrl: profile.avatarUrl ?? "",
  bio: profile.bio,
  links: profile.links.map((link) => ({ ...link })),
});

const normalizeFormState = (form: ProfileFormState) => ({
  displayName: form.displayName.trim(),
  avatarUrl: form.avatarUrl.trim(),
  bio: form.bio.replace(/\r\n/g, "\n"),
  links: form.links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.label.length > 0 && link.url.length > 0)
    .slice(0, MAX_LINKS),
});

const bioMarkdownComponents = {
  p: ({ node, ...props }: { node?: unknown }) => (
    <p className="mt-3 text-[0.95rem] leading-7 text-white/85 first:mt-0" {...props} />
  ),
  strong: ({ node, ...props }: { node?: unknown }) => <strong className="text-white" {...props} />,
  a: ({ node, ...props }: { node?: unknown }) => (
    <a
      className="text-fuchsia-200 underline decoration-dotted underline-offset-4 transition hover:text-fuchsia-100"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  ul: ({ node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  ol: ({ node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  li: ({ node, ...props }: { node?: unknown }) => (
    <li className="marker:text-fuchsia-300" {...props} />
  ),
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatFileSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const inferAvatarMimeType = (file: File) => {
  if (file.type && ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
    return file.type;
  }

  const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) {
    return "";
  }

  switch (match[1]) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    default:
      return "";
  }
};

export function ProfileEditorTab({
  profile,
  profileHistory,
  verifyCredentials,
  onProfileUpdated,
  hasStoredCredentials,
}: ProfileEditorTabProps) {
  const [form, setForm] = useState<ProfileFormState>(() => toFormState(profile));
  const [notice, setNotice] = useState<ChangeNotice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
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

  const previewLinks = normalizedForm.links;
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
      setIsSaving(true);
      setNotice({ type: "success", message: "Verifying credentials…" });
      const credentials = await verifyCredentials();
      setNotice({ type: "success", message: "Preparing profile update…" });

      let avatarUploadPayload: { fileName: string; mimeType: string; base64Data: string } | null = null;
      if (avatarFile) {
        const inferredMimeType = inferAvatarMimeType(avatarFile);
        if (!inferredMimeType) {
          setNotice({ type: "error", message: "Avatar must be a PNG or JPG image." });
          setIsSaving(false);
          return;
        }

        setNotice({ type: "success", message: "Preparing avatar upload…" });
        const base64Data = await readFileAsBase64(avatarFile);
        avatarUploadPayload = {
          fileName: avatarFile.name,
          mimeType: inferredMimeType,
          base64Data,
        };
      }

      setNotice({ type: "success", message: "Saving profile…" });

      const payload: Record<string, unknown> = {
        displayName: normalizedForm.displayName,
        bio: normalizedForm.bio,
        links: normalizedForm.links,
      };

      if (!avatarFile && normalizedForm.avatarUrl.length > 0) {
        payload.avatarUrl = normalizedForm.avatarUrl;
      }

      const requestBody: Record<string, unknown> = {
        username: credentials.username,
        password: credentials.password,
        profile: payload,
      };

      if (avatarUploadPayload) {
        requestBody.avatarUpload = avatarUploadPayload;
      }

      const response = await fetch("/api/save-user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof result.error === "string" ? result.error : "Unable to save profile.";
        setNotice({ type: "error", message });
        return;
      }

      if (result.unchanged) {
        setNotice({ type: "success", message: "Profile already up to date." });
        return;
      }

      const nextProfile: NormalizedUserProfile | undefined = result.profile;
      if (nextProfile) {
        onProfileUpdated(nextProfile, credentials.key);
        setForm(toFormState(nextProfile));
        setAvatarFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }

      setNotice({ type: "success", message: "Profile saved successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify credentials.";
      setNotice({ type: "error", message });
    } finally {
      setIsSaving(false);
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
              <ExternalLink className="h-3.5 w-3.5" />
              View public profile
            </a>
            <UserRound className="hidden h-10 w-10 text-fuchsia-200/80 sm:block" />
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

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-avatar-url">
                  Avatar
                </Label>
                {avatarSelectionSummary && (
                  <span className="text-xs text-white/55">{avatarSelectionSummary}</span>
                )}
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-white/12 via-white/8 to-white/5 text-3xl font-semibold text-white/85 shadow-[0_18px_45px_-20px_rgba(124,58,237,0.55)] ring-1 ring-white/20">
                  {avatarPreviewSource ? (
                    <img src={avatarPreviewSource} alt="Avatar preview" className="h-full w-full object-cover" />
                  ) : (
                    <span>{avatarInitials}</span>
                  )}
                </div>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    onClick={handleAvatarUploadClick}
                  >
                    <ImageUp className="h-4 w-4" />
                    Upload image
                  </Button>
                  {avatarFile ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleClearAvatarSelection}
                    >
                      <ImageOff className="h-4 w-4" />
                      Clear selected image
                    </Button>
                  ) : trimmedAvatarUrl.length > 0 ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleRemoveAvatar}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove avatar
                    </Button>
                  ) : null}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={handleAvatarFileChange}
              />

              <p className="text-xs text-white/45">
                Upload a PNG or JPG file up to {formatFileSize(MAX_AVATAR_BYTES)}. Uploading replaces the hosted
                image for your profile.
              </p>

              <div className="space-y-2">
                <Label htmlFor="profile-avatar-url">
                  Remote image URL (optional)
                </Label>
                <Input
                  id="profile-avatar-url"
                  type="url"
                  value={form.avatarUrl}
                  onChange={(event) => setForm((previous) => ({ ...previous, avatarUrl: event.target.value }))}
                  placeholder="https://example.com/avatar.png"
                />
                <p className="text-xs text-white/45">
                  Provide an https:// image if you prefer hosting elsewhere. Leave blank to fall back to your initials.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-bio">
                  Bio
                </Label>
                <span className={`text-xs ${bioLength > MAX_BIO_LENGTH ? "text-rose-300" : "text-white/45"}`}>
                  {bioLength}/{MAX_BIO_LENGTH}
                </span>
              </div>
              <Textarea
                id="profile-bio"
                className="min-h-[180px] resize-y"
                value={form.bio}
                onChange={(event) => setForm((previous) => ({ ...previous, bio: event.target.value }))}
                placeholder="Share your research focus, experience, or collaboration interests."
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Links</Label>
                <span className="text-xs text-white/45">
                  {form.links.length}/{MAX_LINKS}
                </span>
              </div>

              {form.links.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-white/55">
                  No links added yet. Use the button below to add up to three trusted resources or social profiles.
                </p>
              )}

              <div className="space-y-3">
                {form.links.map((link, index) => (
                  <div key={index} className="grid gap-3 sm:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto]">
                    <Input
                      type="text"
                      value={link.label}
                      onChange={(event) => handleLinkChange(index, "label", event.target.value)}
                      placeholder="Label (e.g., Portfolio)"
                    />
                    <Input
                      type="url"
                      value={link.url}
                      onChange={(event) => handleLinkChange(index, "url", event.target.value)}
                      placeholder="https://example.com"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => handleRemoveLink(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove link</span>
                    </Button>
                  </div>
                ))}
              </div>

              {hasPartialLink && (
                <p className="text-xs text-rose-300">
                  Complete both the label and URL before saving your link.
                </p>
              )}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddLink}
                disabled={form.links.length >= MAX_LINKS}
              >
                <Plus className="h-4 w-4" />
                Add link
              </Button>
            </div>
          </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty || !hasStoredCredentials}
          >
            <Save className="h-4 w-4" />
            Save profile
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleReset}
            disabled={isSaving || !isDirty}
          >
            <RefreshCw className="h-4 w-4" />
            Reset changes
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
