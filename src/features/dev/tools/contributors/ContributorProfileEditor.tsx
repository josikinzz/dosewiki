"use client";

import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EditorActionStatus,
  EditorCheckbox,
  EditorField,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  TagToken,
} from "@/features/dev/components";

import { AvatarUpload } from "./AvatarUpload";
import { BioEditor } from "./BioEditor";
import { ContributorDangerZone } from "./ContributorDangerZone";
import { LinkManager } from "./LinkManager";
import { OrderingPanel } from "./OrderingPanel";
import { formatFileSize } from "./avatarUploadModel";
import { MAX_BIO_LENGTH, MAX_LINKS, addAlias } from "./contributorsModel";
import type { ContributorsController } from "./useContributorsController";

function initialsFor(name: string, key: string): string {
  const basis = (name || key).trim();
  const initials = basis
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("");
  return initials || key.slice(0, 2).toUpperCase();
}

/** Why a trust field is inert for an editor. Shown once per group, and as each control's title. */
const ADMIN_ONLY_REASON = "Admin only: an editor can see this but not change it.";

/**
 * The profile save bar pins to the bottom of the viewport while any profile
 * field is on screen, so Save is never six sections below the field it
 * commits. It scrolls away with the last profile section, before the ordering
 * panels and their own saves begin.
 */
const STICKY_SAVE_BAR_CLASS =
  "sticky bottom-0 z-10 rounded-xl border border-[color:var(--editor-toolbar-separator)] bg-[var(--editor-panel-bg)]/95 p-3 backdrop-blur";

export function ContributorProfileEditor({ controller, contextual = false, onReview }: { controller: ContributorsController; contextual?: boolean; onReview?: () => void }) {
  const {
    canEdit,
    canApprove,
    detail,
    form,
    updateForm,
    aliasDraft,
    setAliasDraft,
    avatarFile,
    setAvatarFile,
    avatarPreviewUrl,
    fileInputRef,
    avatarRemoved,
    removeAvatar,
    handleAvatarFileChange,
    profileSaveState,
    saveProfile,
    discardProfile,
    directory,
    workItems,
    workOrder,
    workSaveState,
    changeWorkOrder,
    resetWorkOrder,
    reportItems,
    reportOrder,
    reportSaveState,
    changeReportOrder,
    resetReportOrder,
    saveOrdering,
    knownAuthorNames,
    isProfileDirty,
    completeDangerOperation,
    removeSelectedProfile,
  } = controller;

  if (!detail || !form) return null;
  const trimmedAvatarUrl = form.avatarUrl.trim();

  return (
    <>
      <div className="space-y-6">
        <EditorSection
          headingLevel="h3"
          icon="lucide:id-card"
          title="Identity"
          actions={
            <Button asChild variant="glass" size="pill" className="text-xs font-medium">
              <Link
                href={`/contributors/${detail.profile.key.toLowerCase()}`}
                target="_blank"
                rel="noopener"
              >
                <Icon icon="lucide:external-link" size={14} />
                View public profile
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contributor-display-name">Display name{contextual ? " (required)" : ""}</Label>
              <Input
                id="contributor-display-name"
                required={contextual || undefined}
                aria-invalid={contextual && !form.displayName.trim() ? true : undefined}
                aria-describedby={contextual && !form.displayName.trim() ? "contributor-display-name-error" : undefined}
                variant={contextual && !form.displayName.trim() ? "error" : "default"}
                value={form.displayName}
                onChange={(event) => updateForm({ displayName: event.target.value })}
                placeholder="Contributor name"
              />
              {contextual && !form.displayName.trim() ? <p id="contributor-display-name-error" role="status" className="text-xs text-dose-danger">Enter a display name to preview publication.</p> : null}
            </div>
            {canEdit && !contextual ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="contributor-role">Role</Label>
                  <Input
                    id="contributor-role"
                    value={form.role}
                    onChange={(event) => updateForm({ role: event.target.value })}
                    placeholder="Editor, Researcher, Artist…"
                    disabled={!canApprove}
                    title={canApprove ? undefined : ADMIN_ONLY_REASON}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="contributor-membership-email">Membership email</Label>
                  <Input
                    id="contributor-membership-email"
                    type="email"
                    value={form.membershipEmail}
                    onChange={(event) => updateForm({ membershipEmail: event.target.value })}
                    placeholder="name@example.com"
                    disabled={!canApprove}
                    title={canApprove ? undefined : ADMIN_ONLY_REASON}
                  />
                  <p className="theme-text-faint text-xs">
                    {canApprove
                      ? "Links this profile to a sign-in, so the owner edits it themselves. Clearing it leaves the profile editor-curated only."
                      : ADMIN_ONLY_REASON}
                  </p>
                </div>
              </>
            ) : null}
          </div>
          <p className="theme-text-faint text-xs">
            {`Key ${detail.profile.key}`}
            {detail.profile.updatedAt
              ? ` · last saved ${detail.profile.updatedAt.slice(0, 10)}`
              : ""}
            {canEdit && detail.profile.updatedBy ? ` by ${detail.profile.updatedBy}` : ""}
          </p>
        </EditorSection>

        <AvatarUpload
          avatarPreviewSource={
            avatarRemoved ? null : avatarPreviewUrl ?? (trimmedAvatarUrl || detail.profile.storedAvatarUrl || null)
          }
          avatarInitials={initialsFor(form.displayName, detail.profile.key)}
          avatarSelectionSummary={
            avatarRemoved ? "Avatar will be removed" : avatarFile
              ? `${avatarFile.name} • ${formatFileSize(avatarFile.size)}`
              : detail.profile.storedAvatarUrl || trimmedAvatarUrl
                ? "Using current image"
                : null
          }
          avatarFile={avatarFile}
          trimmedAvatarUrl={trimmedAvatarUrl}
          onUploadClick={() => fileInputRef.current?.click()}
          onClearSelection={() => setAvatarFile(null)}
          onRemoveAvatar={removeAvatar}
          fileInputRef={fileInputRef}
          onFileChange={handleAvatarFileChange}
          avatarUrl={form.avatarUrl}
          onAvatarUrlChange={(value) => updateForm({ avatarUrl: value })}
        />

        <BioEditor
          bio={form.bio}
          onBioChange={(bio) => updateForm({ bio })}
          bioLength={form.bio.length}
        />

        <LinkManager
          links={form.links}
          onLinkChange={(index, field, value) =>
            updateForm({
              links: form.links.map((link, position) =>
                position === index ? { ...link, [field]: value } : link,
              ),
            })
          }
          onRemoveLink={(index) =>
            updateForm({
              links: form.links.filter((_, position) => position !== index),
            })
          }
          onAddLink={() =>
            updateForm({
              links:
                form.links.length >= MAX_LINKS
                  ? form.links
                  : [...form.links, { label: "", url: "" }],
            })
          }
          hasPartialLink={form.links.some(
            (link) => Boolean(link.label.trim()) !== Boolean(link.url.trim()),
          )}
        />

        {canEdit && !contextual ? (
          <>
            <EditorSection
              headingLevel="h3"
              icon="lucide:tags"
              title="Aliases"
              description="Every byline this profile answers to. Attribution matching and the works list below both resolve through these."
              actions={<EditorStatusPill tone="neutral">{form.aliases.length}</EditorStatusPill>}
            >
              <div className="flex flex-wrap gap-2">
                {form.aliases.map((alias) => (
                  <TagToken
                    key={alias}
                    label={alias}
                    variant="interactive"
                    removeLabel={`Remove alias ${alias}`}
                    onRemove={() =>
                      updateForm({
                        aliases: form.aliases.filter((entry) => entry !== alias),
                      })
                    }
                  />
                ))}
                {form.aliases.length === 0 ? (
                  <p className="theme-text-muted text-sm">
                    No aliases yet. Bylines only match the display name.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={aliasDraft}
                  onChange={(event) => setAliasDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      updateForm({
                        aliases: addAlias(form.aliases, aliasDraft),
                      });
                      setAliasDraft("");
                    }
                  }}
                  placeholder="Add an alias"
                  aria-label="Add an alias"
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!aliasDraft.trim()}
                  onClick={() => {
                    updateForm({ aliases: addAlias(form.aliases, aliasDraft) });
                    setAliasDraft("");
                  }}
                >
                  <Icon icon="lucide:plus" size={15} />
                  Add alias
                </Button>
              </div>
            </EditorSection>

            <EditorSection
              headingLevel="h3"
              icon="lucide:eye-off"
              title="Visibility & provenance"
              description={
                canApprove
                  ? "Where this artist's works surface, and how the profile itself is labelled."
                  : ADMIN_ONLY_REASON
              }
            >
              <EditorCheckbox
                id="contributor-exclude-from-gallery"
                label="Exclude from the Replications gallery"
                description="Hides all of this artist's works on /replications. Effect and substance articles still show them."
                checked={form.exclude_from_gallery}
                onChange={(event) => updateForm({ exclude_from_gallery: event.target.checked })}
                disabled={!canApprove}
                title={canApprove ? undefined : ADMIN_ONLY_REASON}
              />
              <EditorCheckbox
                id="contributor-archival"
                label="Archival profile"
                description={
                  'Shows the public "maintained by staff, not created by this person" notice under the profile handle.'
                }
                checked={form.archival}
                onChange={(event) => updateForm({ archival: event.target.checked })}
                disabled={!canApprove}
                title={canApprove ? undefined : ADMIN_ONLY_REASON}
              />
              <EditorCheckbox
                id="contributor-approved-replicator"
                label="Approved replicator"
                description="Stars this artist's name on the /replications index and lifts their rail above the rest of the default order."
                checked={form.approved_replicator}
                onChange={(event) => updateForm({ approved_replicator: event.target.checked })}
                disabled={!canApprove}
                title={canApprove ? undefined : ADMIN_ONLY_REASON}
              />
            </EditorSection>

            <EditorSection
              headingLevel="h3"
              icon="lucide:message-circle"
              title="Editor's note"
              description={
                canApprove
                  ? "Signed staff commentary rendered as a speech bubble under the public bio. Leave the note empty to remove the section."
                  : ADMIN_ONLY_REASON
              }
            >
              <EditorField
                id="contributor-staff-note"
                label="Note (markdown)"
                counter={`${form.staffNoteMarkdown.length}/${MAX_BIO_LENGTH}`}
                error={
                  form.staffNoteMarkdown.length > MAX_BIO_LENGTH
                    ? `The note must be ${MAX_BIO_LENGTH} characters or fewer.`
                    : undefined
                }
                errorLive
              >
                {(fieldProps) => (
                  <Textarea
                    {...fieldProps}
                    className="min-h-[120px] resize-y"
                    value={form.staffNoteMarkdown}
                    onChange={(event) => updateForm({ staffNoteMarkdown: event.target.value })}
                    placeholder="Why this person's work matters, in the site's voice."
                    variant={form.staffNoteMarkdown.length > MAX_BIO_LENGTH ? "error" : "default"}
                    disabled={!canApprove}
                    title={canApprove ? undefined : ADMIN_ONLY_REASON}
                  />
                )}
              </EditorField>
              <div className="space-y-2">
                <Label htmlFor="contributor-staff-note-attribution">Attribution</Label>
                <Input
                  id="contributor-staff-note-attribution"
                  value={form.staffNoteAttribution}
                  onChange={(event) => updateForm({ staffNoteAttribution: event.target.value })}
                  placeholder="Josie Kins · founder"
                  className="max-w-xs"
                  disabled={!canApprove}
                  title={canApprove ? undefined : ADMIN_ONLY_REASON}
                />
                <p className="theme-text-faint text-xs">
                  Shown beneath the bubble next to Josie&apos;s avatar. Empty falls back to
                  Josie&apos;s public name and role.
                </p>
              </div>
            </EditorSection>
          </>
        ) : null}

        <EditorToolbar
          variant="split"
          label="Profile save actions"
          className={STICKY_SAVE_BAR_CLASS}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={
                !isProfileDirty ||
                profileSaveState === "saving" ||
                form.bio.length > MAX_BIO_LENGTH ||
                !form.displayName.trim()
              }
              onClick={() => onReview ? onReview() : void saveProfile()}
            >
              <Icon icon="lucide:save" size={15} />
              {onReview ? "Preview publication" : "Save profile"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!isProfileDirty || profileSaveState === "saving"}
              onClick={discardProfile}
            >
              <Icon icon="lucide:rotate-ccw" size={15} />
              Discard changes
            </Button>
          </div>
          {profileSaveState === "idle" ? (
            <EditorStatusPill tone={isProfileDirty ? "warning" : "neutral"}>
              {isProfileDirty ? "Unsaved changes" : "No changes"}
            </EditorStatusPill>
          ) : (
            <EditorActionStatus status={profileSaveState} />
          )}
        </EditorToolbar>
      </div>

      {canEdit && !contextual ? (
        <>
          <OrderingPanel
            icon="lucide:image"
            title="Works"
            description="Replications credited to this contributor. Curated items lead the gallery on their profile; the rest follow newest first."
            items={workItems}
            order={workOrder}
            savedOrder={detail.profile.replicationOrder}
            emptyLabel="No replications are credited to this contributor's name or aliases."
            saveLabel="Save works order"
            saveState={workSaveState}
            onOrderChange={changeWorkOrder}
            onSave={() => void saveOrdering("works")}
            onReset={resetWorkOrder}
          />

          <OrderingPanel
            icon="lucide:notebook-text"
            title="Reports"
            description="Trip reports credited to this contributor. Curated items lead their profile; the rest follow by trip date, newest first."
            items={reportItems}
            order={reportOrder}
            savedOrder={detail.profile.reportOrder}
            emptyLabel="No trip reports are credited to this contributor."
            saveLabel="Save reports order"
            saveState={reportSaveState}
            onOrderChange={changeReportOrder}
            onSave={() => void saveOrdering("reports")}
            onReset={resetReportOrder}
          />

          <ContributorDangerZone
            profileKey={detail.profile.key}
            displayName={detail.profile.displayName}
            directory={directory}
            knownAuthorNames={knownAuthorNames}
            onCompleted={completeDangerOperation}
            onProfileRemoved={removeSelectedProfile}
          />
        </>
      ) : null}
    </>
  );
}
