import { useCallback, useRef, type ChangeEvent } from "react";
import { Icon } from "@/components/common/Icon";

import { SectionCard } from "@/components/common/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getDevNoticeRenderProps } from "@/features/dev/notices/devNoticeLifecycle";
import {
  EditorActionGroup,
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
  const noticeRenderProps = model.notice
    ? getDevNoticeRenderProps(
        {
          status: model.notice.type,
          severity:
            model.notice.type === "error"
              ? "danger"
              : model.notice.type === "success"
                ? "success"
                : "info",
        },
        {
          error: "Profile update failed",
          pending: "Working...",
          success: "Profile status",
        },
      )
    : null;

  return (
    <div className="mt-12">
      <SectionCard className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.35em]">Profile</p>
            <h2 className="theme-accent-heading text-lg font-semibold">Edit contributor bio</h2>
            <p className="theme-text-muted mt-2 text-sm">
              Update your public profile copy, avatar, and external links. Markdown is supported in the bio field.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <EditorStatusPill tone={model.isDirty ? "warning" : "success"}>
                {model.isDirty ? "Unsaved changes" : "No changes"}
              </EditorStatusPill>
              <EditorStatusPill tone={hasStoredCredentials ? "success" : "danger"}>
                {hasStoredCredentials ? "Signed in" : "Sign in required"}
              </EditorStatusPill>
              <EditorStatusPill tone="neutral">@{profile.key}</EditorStatusPill>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <Button asChild variant="glass" size="pill" className="text-xs font-medium">
              <a href={`#/contributors/${profile.key}`}>
                <Icon icon="lucide:external-link" size={14} />
                View public profile
              </a>
            </Button>
            <Icon icon="lucide:user-round" className="theme-icon-accent hidden h-10 w-10 sm:block" size={40} />
          </div>
        </div>

        {model.notice && noticeRenderProps && (
          <Alert variant={noticeRenderProps.variant} aria-live={noticeRenderProps.ariaLive}>
            <Icon
              icon={noticeRenderProps.icon}
              size={16}
              className={noticeRenderProps.spin ? "animate-spin" : undefined}
            />
            <AlertTitle>{noticeRenderProps.title}</AlertTitle>
            <AlertDescription>{model.notice.message}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
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
        </div>

        <div className="rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-3">
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
              <EditorStatusPill tone={model.isDirty ? "warning" : "success"}>
                {model.isDirty ? "Ready to review" : "Saved state"}
              </EditorStatusPill>
            </EditorActionGroup>
          </EditorToolbar>
          {!hasStoredCredentials ? (
            <p className="theme-text-faint mt-3 text-xs">
              Sign in with a contributor account before saving public profile changes.
            </p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
