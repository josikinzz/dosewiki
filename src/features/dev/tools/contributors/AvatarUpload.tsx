import { useId, useState } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { EditorField, Notice, type NoticeMessage } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { formatFileSize } from "./avatarUploadModel";
import { MAX_AVATAR_BYTES } from "./contributorsModel";

export type AvatarUploadProps = {
  /** The name the initials fall back to, as the public page draws them. */
  name: string;
  avatarPreviewSource: string | null;
  /** What the picture is right now, in words ("Current picture", "Removed when you save"). */
  avatarSelectionSummary: string | null;
  avatarFile: File | null;
  trimmedAvatarUrl: string;
  /** A saved picture (an address or an upload) that Remove can clear. */
  canRemove?: boolean;
  onUploadClick: () => void;
  onClearSelection: () => void;
  onRemoveAvatar: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  avatarUrl: string;
  onAvatarUrlChange: (value: string) => void;
  /** A picked or refused file, said beside the picture. */
  notice?: NoticeMessage | null;
  onDismissNotice?: () => void;
  headingLevel?: "h3" | "h4" | "h5";
  headingClassName?: string;
};

/**
 * The profile picture: a preview drawn the way the public contributor page
 * draws it (a circle cropped to the centre, initials when there is none), the
 * upload beside it, and a hosted address folded away for the rarer case.
 */
export function AvatarUpload({
  name,
  avatarPreviewSource,
  avatarSelectionSummary,
  avatarFile,
  trimmedAvatarUrl,
  canRemove = trimmedAvatarUrl.length > 0,
  onUploadClick,
  onClearSelection,
  onRemoveAvatar,
  fileInputRef,
  onFileChange,
  avatarUrl,
  onAvatarUrlChange,
  notice = null,
  onDismissNotice,
  headingLevel: Heading = "h4",
  headingClassName,
}: AvatarUploadProps) {
  const id = useId();
  const [addressOpen, setAddressOpen] = useState(() => trimmedAvatarUrl.length > 0);
  const hasPicture = Boolean(avatarPreviewSource);

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <Heading id={`${id}-heading`} className={headingClassName}>
        Avatar
      </Heading>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <ContributorAvatar imageUrl={avatarPreviewSource} name={name || "?"} size="md" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onUploadClick}>
              <Icon icon="lucide:image-up" size={15} />
              {hasPicture ? "Replace picture" : "Upload a picture"}
            </Button>
            {avatarFile ? (
              <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
                <Icon icon="lucide:image-off" size={15} />
                Clear selected image
              </Button>
            ) : canRemove ? (
              <Button type="button" variant="ghostDestructive" size="sm" onClick={onRemoveAvatar}>
                <Icon icon="lucide:trash-2" size={15} />
                Remove avatar
              </Button>
            ) : null}
          </div>
          <p className="theme-text-muted text-xs" aria-live="polite">
            {avatarSelectionSummary ?? "No picture yet, so the page shows initials."}
          </p>
          <p className="theme-text-faint text-xs">
            PNG, JPG or WebP up to {formatFileSize(MAX_AVATAR_BYTES)}. The page shows it in a circle, cropped to the
            centre. Uploading replaces the hosted image.
          </p>
        </div>
      </div>

      {notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Upload a picture"
        tabIndex={-1}
        className="sr-only"
        onChange={onFileChange}
      />

      <div className="space-y-2">
        <button
          type="button"
          aria-expanded={addressOpen}
          aria-controls={`${id}-address`}
          onClick={() => setAddressOpen((open) => !open)}
          className={cn("theme-focus-ring theme-text-muted hover:theme-text-primary inline-flex items-center gap-1.5 rounded-control text-sm", TOUCH_HALO)}
        >
          Use an image address instead
          <ExpandIndicator isExpanded={addressOpen} />
        </button>
        <div id={`${id}-address`} hidden={!addressOpen}>
          <EditorField
            id="profile-avatar-url"
            label="Image address"
            description="An https:// image hosted elsewhere. Leave it empty to fall back to an uploaded picture or initials."
          >
            {(control) => (
              <Input
                {...control}
                type="url"
                inputMode="url"
                value={avatarUrl}
                onChange={(event) => onAvatarUrlChange(event.target.value)}
                placeholder="https://example.com/avatar.png"
                className="text-[16px] md:text-sm"
              />
            )}
          </EditorField>
        </div>
      </div>
    </section>
  );
}
