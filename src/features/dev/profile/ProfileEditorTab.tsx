import { useCallback, useRef, type ChangeEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/common/Icon";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ActionNotice,
  EditorActionGroup,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";

import { AvatarUpload } from "./AvatarUpload";
import { LinkManager } from "./LinkManager";
import { BioEditor } from "./BioEditor";
import { useProfileEditorModel } from "./useProfileEditorModel";
import type { ProfileEditorTabProps } from "./types";

export function ProfileEditorTab({
  profile,
  profileHistory: _profileHistory,
  verifyCredentials,
  onProfileUpdated,
  hasStoredCredentials,
}: ProfileEditorTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const model = useProfileEditorModel({
    profile,
    verifyCredentials,
    onProfileUpdated,
    hasStoredCredentials,
  });

  const handleAvatarUploadClick = useCallback(() => {
    model.commands.clearNotice();
    fileInputRef.current?.click();
  }, [model.commands]);

  const handleAvatarFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      model.commands.selectAvatarFile(file ?? null);
    },
    [model.commands],
  );

  const handleClearAvatarSelection = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    model.commands.clearAvatarSelection();
  }, [model.commands]);

  const handleRemoveAvatar = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    model.commands.removeAvatar();
  }, [model.commands]);

  const handleReset = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    model.commands.reset();
  };
  const noticeTone =
    model.notice?.type === "error"
      ? "danger"
      : model.notice?.type === "pending"
        ? "info"
        : "success";

  return (
    <div className="mt-12 space-y-8">
      <EditorSection
        icon="lucide:user-round"
        title="Edit contributor bio"
        description="Update your public profile copy, avatar, and external links. Markdown is supported in the bio field."
        actions={(
          <Button asChild variant="glass" size="pill" className="text-xs font-medium">
            <Link
              href={`/contributors/${profile.key.toLowerCase()}`}
              target="_blank"
              rel="noopener"
            >
              <Icon icon="lucide:external-link" size={14} />
              View public profile
            </Link>
          </Button>
        )}
      >
        {!hasStoredCredentials ? (
          <EditorStatusPill tone="danger">Sign in required</EditorStatusPill>
        ) : null}
      </EditorSection>

      <EditorSection icon="lucide:id-card" title="Identity">
        <div className="space-y-2">
          <Label htmlFor="profile-display-name">Display name</Label>
          <Input
            id="profile-display-name"
            type="text"
            value={model.form.displayName}
            onChange={(event) => model.commands.changeDisplayName(event.target.value)}
            placeholder="Contributor name"
          />
        </div>
      </EditorSection>

      <AvatarUpload
        avatarPreviewSource={model.avatarPreviewSource}
        avatarInitials={model.avatarInitials}
        avatarSelectionSummary={model.avatarSelectionSummary}
        avatarFile={model.avatarFile}
        trimmedAvatarUrl={model.trimmedAvatarUrl}
        onUploadClick={handleAvatarUploadClick}
        onClearSelection={handleClearAvatarSelection}
        onRemoveAvatar={handleRemoveAvatar}
        fileInputRef={fileInputRef}
        onFileChange={handleAvatarFileChange}
        avatarUrl={model.form.avatarUrl}
        onAvatarUrlChange={model.commands.changeAvatarUrl}
      />

      <BioEditor
        bio={model.form.bio}
        onBioChange={model.commands.changeBio}
        bioLength={model.bioLength}
      />

      <LinkManager
        links={model.form.links}
        onLinkChange={model.commands.changeLink}
        onRemoveLink={model.commands.removeLink}
        onAddLink={model.commands.addLink}
        hasPartialLink={model.hasPartialLink}
      />

      <div className="space-y-3">
        <div className="theme-gradient-divider h-px" />
        <EditorToolbar label="Profile save actions" variant="split">
          <EditorActionGroup label="Profile save controls">
            <Button
              type="button"
              onClick={model.commands.save}
              disabled={model.isSaving || !model.isDirty || !hasStoredCredentials}
            >
              <Icon icon={model.isSaving ? "lucide:loader-2" : "lucide:save"} size={16} className={model.isSaving ? "animate-spin" : undefined} />
              Save profile
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleReset}
              disabled={model.isSaving || !model.isDirty}
            >
              <Icon icon="lucide:refresh-cw" size={16} />
              Reset changes
            </Button>
          </EditorActionGroup>
          <EditorActionGroup label="Profile save status" align="end" separatorBefore>
            {model.notice ? (
              <ActionNotice
                tone={noticeTone}
                loading={model.notice.type === "pending"}
                onDismiss={model.notice.type === "pending" ? undefined : model.commands.clearNotice}
              >
                {model.notice.message}
              </ActionNotice>
            ) : (
              <EditorStatusPill
                tone={model.isSaving ? "info" : model.isDirty ? "warning" : "success"}
                loading={model.isSaving}
                live
              >
                {model.isSaving ? "Saving…" : model.isDirty ? "Unsaved changes" : "Saved"}
              </EditorStatusPill>
            )}
          </EditorActionGroup>
        </EditorToolbar>
        {!hasStoredCredentials ? (
          <p className="theme-text-faint text-xs">
            Sign in with a contributor account before saving public profile changes.
          </p>
        ) : null}
      </div>
    </div>
  );
}
