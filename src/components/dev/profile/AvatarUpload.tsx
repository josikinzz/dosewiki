import { ImageOff, ImageUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { formatFileSize } from "./utils.tsx";
import { MAX_AVATAR_BYTES } from "./types";
import type { AvatarUploadProps } from "./types";

export function AvatarUpload({
  avatarPreviewSource,
  avatarInitials,
  avatarSelectionSummary,
  avatarFile,
  trimmedAvatarUrl,
  onUploadClick,
  onClearSelection,
  onRemoveAvatar,
  fileInputRef,
  onFileChange,
  avatarUrl,
  onAvatarUrlChange,
}: AvatarUploadProps) {
  return (
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
            onClick={onUploadClick}
          >
            <ImageUp className="h-4 w-4" />
            Upload image
          </Button>
          {avatarFile ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onClearSelection}
            >
              <ImageOff className="h-4 w-4" />
              Clear selected image
            </Button>
          ) : trimmedAvatarUrl.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              onClick={onRemoveAvatar}
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
        onChange={onFileChange}
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
          value={avatarUrl}
          onChange={(event) => onAvatarUrlChange(event.target.value)}
          placeholder="https://example.com/avatar.png"
        />
        <p className="text-xs text-white/45">
          Provide an https:// image if you prefer hosting elsewhere. Leave blank to fall back to your initials.
        </p>
      </div>
    </div>
  );
}
