import { Icon } from "@/components/common/Icon";
import { AppImage } from "@/components/common/AppImage";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NestedContentCard } from "@/components/ui/surface";
import { EditorSection } from "@/features/dev/components";

import { formatFileSize } from "./avatarUploadModel";
import { MAX_AVATAR_BYTES } from "./contributorsModel";

export type AvatarUploadProps = {
  avatarPreviewSource: string | null;
  avatarInitials: string;
  avatarSelectionSummary: string | null;
  avatarFile: File | null;
  trimmedAvatarUrl: string;
  onUploadClick: () => void;
  onClearSelection: () => void;
  onRemoveAvatar: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  avatarUrl: string;
  onAvatarUrlChange: (value: string) => void;
};

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
    <EditorSection icon="lucide:image" title="Avatar">
      <div className="flex flex-wrap items-center gap-4">
        <NestedContentCard
          padding="none"
          radius="xl"
          className="theme-text-primary flex h-24 w-24 items-center justify-center overflow-hidden border-[color:var(--theme-frosted-control-on-panel-border)] [background:var(--theme-frosted-control-on-panel-bg)] text-3xl font-semibold shadow-[var(--theme-frosted-control-on-panel-shadow)]"
        >
          {avatarPreviewSource ? (
            <AppImage src={avatarPreviewSource} alt="Avatar preview" width={96} height={96} className="h-full w-full object-cover" />
          ) : (
            <span>{avatarInitials}</span>
          )}
        </NestedContentCard>
        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap items-center gap-3">
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
          {avatarSelectionSummary ? (
            <span className="theme-text-faint text-xs">{avatarSelectionSummary}</span>
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

      <p className="theme-text-faint text-xs">
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
        <p className="theme-text-faint text-xs">
          Provide an https:// image if you prefer hosting elsewhere. Leave blank to fall back to your initials.
        </p>
      </div>
    </EditorSection>
  );
}
