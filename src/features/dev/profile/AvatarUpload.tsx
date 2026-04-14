import { Icon } from "@/components/common/Icon";
import { AppImage } from "@/components/common/AppImage";

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
            <AppImage src={avatarPreviewSource} alt="Avatar preview" width={96} height={96} className="h-full w-full object-cover" />
          ) : (
            <span>{avatarInitials}</span>
          )}
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={onUploadClick}
          >
            <Icon icon="lucide:image-up" size={16} />
            Upload image
          </Button>
          {avatarFile ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onClearSelection}
            >
              <Icon icon="lucide:image-off" size={16} />
              Clear selected image
            </Button>
          ) : trimmedAvatarUrl.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              onClick={onRemoveAvatar}
            >
              <Icon icon="lucide:trash-2" size={16} />
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
        Upload a PNG, JPG, or WebP file up to {formatFileSize(MAX_AVATAR_BYTES)}. Uploading replaces the hosted
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
