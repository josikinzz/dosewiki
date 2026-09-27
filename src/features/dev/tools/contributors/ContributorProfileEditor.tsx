"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EditorCheckbox,
  EditorField,
  Notice,
  SaveLine,
  TagToken,
  useConfirm,
  useDevShortcuts,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { devHref } from "@/utils/devHref";

import { useModifierKeyLabel } from "../../pages/DevCommandPalette";
import { RelativeDay } from "../home/homeParts";
import { AvatarUpload } from "./AvatarUpload";
import { BioEditor } from "./BioEditor";
import { ContributorDangerZone } from "./ContributorDangerZone";
import { LinkManager } from "./LinkManager";
import { OrderingPanel } from "./OrderingPanel";
import { formatFileSize } from "./avatarUploadModel";
import { MAX_BIO_LENGTH, MAX_LINKS, addAlias } from "./contributorsModel";
import { changedProfileParts, joinProfileParts, moveLink, profileSaveBlocker, trustFlagChanges } from "./profileEditModel";
import type { ContributorsController } from "./useContributorsController";

/** Why a trust field is inert for an editor. Shown once per group, and as each control's title. */
const ADMIN_ONLY_REASON = "Admin only: an editor can see this but not change it.";

const SAVE_SHORTCUTS = [{ keys: "Cmd+S", label: "Save the open profile" }] as const;

type HeadingLevel = "h3" | "h4" | "h5";

/** The public contributor page for a key (keys are stored upper case; the page reads lower). */
export function publicProfileHref(key: string): string {
  return `/contributors/${key.toLowerCase()}`;
}

/**
 * The contributor profile form, shared by Contributors, People and the public
 * artist page's contextual editor.
 *
 * Top to bottom: who it is (name, credit title, the linked account), the
 * picture, the bio, links, aliases, the admin-only settings, and a save dock
 * that sticks to the bottom of the screen while any of those is in view. The
 * curated orders and the identity operations follow the dock because each has
 * a save of its own; the operations are folded shut. A record the viewer may
 * not change opens read only, without a dock.
 */
export function ContributorProfileEditor({
  controller,
  contextual = false,
  onReview,
  linkedAccount,
  headingLevel = "h4",
  showFacts = true,
  showSaveLine = false,
  saveShortcut = false,
}: {
  controller: ContributorsController;
  contextual?: boolean;
  onReview?: () => void;
  /**
   * Replaces the linked-account line. People draws the link beside the
   * account it names, so it passes `null`; the Contributors tab keeps the
   * read-only line that points there.
   */
  linkedAccount?: ReactNode;
  /** Heading tag for the editor's own sections; People nests it one deeper. */
  headingLevel?: HeadingLevel;
  /** The key, last save and public page link above the form. Contributors draws them in its pane header instead. */
  showFacts?: boolean;
  /** The tool's save sentence in the dock (Contributors, where the shell does not draw one). */
  showSaveLine?: boolean;
  /** Cmd/Ctrl+S asks to save; one tool at a time may own the key. */
  saveShortcut?: boolean;
}) {
  const {
    canEdit,
    canApprove,
    canWrite,
    detail,
    form,
    updateForm,
    aliasDraft,
    setAliasDraft,
    avatarFile,
    clearAvatarFile,
    avatarPreviewUrl,
    fileInputRef,
    avatarRemoved,
    removeAvatar,
    handleAvatarFileChange,
    avatarNotice,
    dismissAvatarNotice,
    profileSaveState,
    saveProfile,
    discardProfile,
    profileNotice,
    dismissProfileNotice,
    loadLatest,
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
    orderNotices,
    dismissOrderNotice,
    knownAuthorNames,
    isProfileDirty,
    completeDangerOperation,
    removeSelectedProfile,
    dangerNotice,
    dismissDangerNotice,
  } = controller;
  const { confirm, dialog } = useConfirm();
  const saveKeyLabel = useModifierKeyLabel("S");
  const staffId = useId();
  const saving = profileSaveState === "saving";
  const blocker = form ? profileSaveBlocker(form) : null;
  const canSave = Boolean(detail && form) && canWrite && isProfileDirty && !saving && blocker === null;
  const curated = canEdit && !contextual;
  const Heading = headingLevel;
  const headingClass = "theme-text-primary text-base font-semibold";

  const askSave = () => {
    if (!detail || !form || !canSave) return;
    if (onReview) {
      onReview();
      return;
    }
    const parts = changedProfileParts(detail.profile, form, { picked: avatarFile !== null, removed: avatarRemoved });
    const name = form.displayName.trim() || detail.profile.displayName;
    const flags = trustFlagChanges(detail.profile, form);
    confirm({
      title: `Save ${name}?`,
      description: `${parts.length > 0 ? `You changed ${joinProfileParts(parts)}. ` : ""}The public contributor page shows the change as soon as it saves.`,
      body: flags.length > 0 ? (
        <ul className="theme-text-secondary list-disc space-y-1 pl-5 text-sm">
          {flags.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : undefined,
      confirmLabel: "Save profile",
      onConfirm: () => saveProfile(),
    });
  };

  // Cmd or Ctrl+S opens the same confirm Save does; it never saves past it.
  useDevShortcuts(SAVE_SHORTCUTS, saveShortcut && Boolean(detail) && canWrite);
  const askSaveRef = useRef(askSave);
  askSaveRef.current = askSave;
  useEffect(() => {
    if (!saveShortcut || !canWrite) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      if (!detail) return;
      event.preventDefault();
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      askSaveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canWrite, detail, saveShortcut]);

  if (!detail || !form) return dialog;
  const trimmedAvatarUrl = form.avatarUrl.trim();
  const profile = detail.profile;

  const askLoadLatest = () =>
    confirm({
      title: "Load the latest version?",
      description: "Your edits here are dropped and the editor shows the profile as it is stored now. Note anything you want to keep first.",
      confirmLabel: "Load latest",
      destructive: true,
      onConfirm: () => loadLatest("profile"),
    });
  const askLoadOrder = (which: "works" | "reports") =>
    confirm({
      title: "Load the stored order?",
      description: `Your unsaved ${which === "works" ? "works" : "reports"} order is dropped and the list shows the order as it is stored now. Profile edits stay as they are.`,
      confirmLabel: "Load stored order",
      destructive: true,
      onConfirm: () => loadLatest(which),
    });
  const orderNotice = (which: "works" | "reports") => {
    const notice = orderNotices[which];
    if (!notice) return null;
    return notice.failure === "conflict"
      ? {
          ...notice,
          actions: (
            <Button type="button" variant="outline" size="sm" onClick={() => askLoadOrder(which)}>
              Load the stored order
            </Button>
          ),
        }
      : notice;
  };

  const dockNotice = profileNotice && !contextual
    ? profileNotice.failure === "conflict"
      ? {
          ...profileNotice,
          actions: (
            <Button type="button" variant="outline" size="sm" onClick={askLoadLatest}>
              Load the latest version
            </Button>
          ),
        }
      : profileNotice
    : null;
  const nameMissing = !form.displayName.trim();

  return (
    <>
      {dialog}
      {/* Fields scrolled to by focus keep clear of the sticky dock and the public header. */}
      <div className="space-y-8 [&_:is(input,button,textarea)]:scroll-mb-40 [&_:is(input,button,textarea)]:scroll-mt-28">
        {showFacts ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <ProfileFacts profile={profile} canEdit={canEdit} />
            <PublicProfileLink profileKey={profile.key} />
          </div>
        ) : null}

        {!canWrite ? (
          <p className="theme-text-muted flex items-start gap-2 text-sm">
            <Icon icon="lucide:lock" size={14} className="theme-text-faint mt-0.5 shrink-0" />
            <span>
              Read only.{" "}
              {profile.membershipEmail
                ? "Another member is linked to this profile, so only they or an admin can change it."
                : "No one has claimed this profile, so only an admin can change it."}
            </span>
          </p>
        ) : null}

        <fieldset disabled={!canWrite} className="min-w-0 space-y-8">
          <legend className="sr-only">Profile</legend>
          <section aria-labelledby={`${staffId}-identity`} className="space-y-3">
            <Heading id={`${staffId}-identity`} className={headingClass}>
              Identity
            </Heading>
            <div className="grid gap-4 md:grid-cols-2">
              <EditorField
                id="contributor-display-name"
                label={contextual ? "Display name (required)" : "Display name"}
                description={contextual ? undefined : "The name the page and every credit show."}
                error={contextual && nameMissing ? "Enter a display name to preview publication." : undefined}
                errorLive={contextual}
              >
                {(control) => (
                  <Input
                    {...control}
                    required={contextual || undefined}
                    variant={contextual && nameMissing ? "error" : "default"}
                    value={form.displayName}
                    onChange={(event) => updateForm({ displayName: event.target.value })}
                    placeholder="Contributor name"
                    className="text-[16px] md:text-sm"
                  />
                )}
              </EditorField>
              {curated ? (
                <EditorField
                  id="contributor-role"
                  label="Credit title"
                  description={canApprove ? "Under the name, such as Editor, Researcher or Artist." : ADMIN_ONLY_REASON}
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={form.role}
                      onChange={(event) => updateForm({ role: event.target.value })}
                      placeholder="Editor, Researcher, Artist"
                      disabled={!canApprove}
                      title={canApprove ? undefined : ADMIN_ONLY_REASON}
                      className="text-[16px] md:text-sm"
                    />
                  )}
                </EditorField>
              ) : null}
            </div>
            {curated ? (
              linkedAccount === undefined ? (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <p className="theme-text-secondary flex min-w-0 items-start gap-2">
                    <Icon icon={profile.membershipEmail ? "lucide:link" : "lucide:unlink"} size={14} className="theme-text-faint mt-0.5 shrink-0" />
                    {profile.membershipEmail ? (
                      <span className="min-w-0 break-all">
                        Linked account: <span className="theme-text-primary">{profile.membershipEmail}</span>
                      </span>
                    ) : (
                      <span>No linked account, so no member edits this profile themselves.</span>
                    )}
                  </p>
                  {canApprove ? (
                    <a
                      href={devHref({ type: "dev", tab: "people", slug: profile.key })}
                      className="text-dose-accent-strong theme-accent-underline inline-flex items-center gap-1 underline-offset-4 hover:underline"
                    >
                      {profile.membershipEmail ? "Change the link in People" : "Link an account in People"}
                      <Icon icon="lucide:arrow-right" size={12} />
                    </a>
                  ) : (
                    <p className="theme-text-faint text-xs">{ADMIN_ONLY_REASON}</p>
                  )}
                </div>
              ) : (
                linkedAccount
              )
            ) : null}
          </section>

          <AvatarUpload
            name={form.displayName.trim() || profile.displayName}
            headingLevel={headingLevel}
            headingClassName={headingClass}
            avatarPreviewSource={
              avatarRemoved ? null : avatarPreviewUrl ?? (trimmedAvatarUrl || profile.storedAvatarUrl || null)
            }
            avatarSelectionSummary={
              avatarRemoved
                ? "Removed when you save."
                : avatarFile
                  ? `${avatarFile.name}, ${formatFileSize(avatarFile.size)}. Published when you save.`
                  : trimmedAvatarUrl
                    ? "Using the image address below."
                    : profile.storedAvatarUrl
                      ? "Using the uploaded picture."
                      : null
            }
            avatarFile={avatarFile}
            trimmedAvatarUrl={trimmedAvatarUrl}
            canRemove={!avatarRemoved && Boolean(trimmedAvatarUrl || profile.storedAvatarUrl)}
            onUploadClick={() => fileInputRef.current?.click()}
            onClearSelection={clearAvatarFile}
            onRemoveAvatar={removeAvatar}
            fileInputRef={fileInputRef}
            onFileChange={handleAvatarFileChange}
            avatarUrl={form.avatarUrl}
            onAvatarUrlChange={(value) => updateForm({ avatarUrl: value })}
            notice={contextual ? null : avatarNotice}
            onDismissNotice={dismissAvatarNotice}
          />

          <BioEditor
            headingLevel={headingLevel}
            headingClassName={headingClass}
            bio={form.bio}
            onBioChange={(bio) => updateForm({ bio })}
            bioLength={form.bio.length}
          />

          <LinkManager
            headingLevel={headingLevel}
            headingClassName={headingClass}
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
            onMoveLink={(from, to) => updateForm({ links: moveLink(form.links, from, to) })}
          />

          {curated ? (
            <>
              <section aria-labelledby={`${staffId}-aliases`} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <Heading id={`${staffId}-aliases`} className={headingClass}>
                    Aliases
                  </Heading>
                  <p className="theme-text-muted text-sm tabular-nums">{form.aliases.length}</p>
                </div>
                <p className="theme-text-muted max-w-[65ch] text-sm">
                  Every byline this profile answers to. Credits on works and reports match through these, and so do the
                  lists below.
                </p>
                {form.aliases.length > 0 ? (
                  <ul aria-label="Aliases" className="flex flex-wrap gap-2">
                    {form.aliases.map((alias) => (
                      <li key={alias}>
                        <TagToken
                          label={alias}
                          variant="interactive"
                          removeLabel={`Remove alias ${alias}`}
                          onRemove={() =>
                            updateForm({
                              aliases: form.aliases.filter((entry) => entry !== alias),
                            })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="theme-text-faint text-sm">No aliases yet. Bylines only match the display name.</p>
                )}
                <div className="flex max-w-md items-center gap-2">
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
                    aria-description="Press Enter to add it. Case does not matter; a repeat is skipped."
                    className="min-w-0 flex-1 text-[16px] md:text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
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
              </section>

              <section aria-labelledby={`${staffId}-staff`} className="space-y-5">
                <div className="space-y-1">
                  <Heading id={`${staffId}-staff`} className={cn(headingClass, "flex items-center gap-2")}>
                    Staff settings
                    {canApprove ? null : <Icon icon="lucide:lock" size={14} className="theme-text-faint" />}
                  </Heading>
                  <p className="theme-text-muted max-w-[65ch] text-sm">
                    {canApprove
                      ? "How the site labels this profile and where its work shows. Admins set these."
                      : ADMIN_ONLY_REASON}
                  </p>
                </div>
                <fieldset className="space-y-3">
                  <legend className="theme-text-secondary mb-3 text-sm font-medium">Visibility and provenance</legend>
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
                </fieldset>

                <fieldset className="space-y-4">
                  <legend className="theme-text-secondary mb-1 text-sm font-medium">Editor&apos;s note</legend>
                  <p className="theme-text-faint max-w-[65ch] text-xs">
                    Signed staff commentary, shown as a speech bubble under the public bio. Empty removes the section.
                  </p>
                  <EditorField
                    id="contributor-staff-note"
                    label="Note (markdown)"
                    counter={`${form.staffNoteMarkdown.length.toLocaleString()} of ${MAX_BIO_LENGTH.toLocaleString()}`}
                    error={
                      form.staffNoteMarkdown.length > MAX_BIO_LENGTH
                        ? `The note must be ${MAX_BIO_LENGTH.toLocaleString()} characters or fewer.`
                        : undefined
                    }
                    errorLive
                  >
                    {(fieldProps) => (
                      <Textarea
                        {...fieldProps}
                        className="min-h-[120px] resize-y text-[16px] md:text-sm"
                        value={form.staffNoteMarkdown}
                        onChange={(event) => updateForm({ staffNoteMarkdown: event.target.value })}
                        placeholder="Why this person's work matters, in the site's voice."
                        variant={form.staffNoteMarkdown.length > MAX_BIO_LENGTH ? "error" : "default"}
                        disabled={!canApprove}
                        title={canApprove ? undefined : ADMIN_ONLY_REASON}
                      />
                    )}
                  </EditorField>
                  <EditorField
                    id="contributor-staff-note-attribution"
                    label="Attribution"
                    description="Shown under the bubble beside the signer's avatar. Empty falls back to the signer's public name and credit title."
                  >
                    {(control) => (
                      <Input
                        {...control}
                        value={form.staffNoteAttribution}
                        onChange={(event) => updateForm({ staffNoteAttribution: event.target.value })}
                        placeholder="Ada Lovelace, editor"
                        className="max-w-sm text-[16px] md:text-sm"
                        disabled={!canApprove}
                        title={canApprove ? undefined : ADMIN_ONLY_REASON}
                      />
                    )}
                  </EditorField>
                </fieldset>
              </section>
            </>
          ) : null}
        </fieldset>

        {canWrite ? (
          <footer
            aria-label="Save"
            className={cn(
              "theme-portal-rule sticky bottom-0 z-10 space-y-2.5 border-t bg-[var(--editor-panel-bg)]/95 py-3 backdrop-blur",
              contextual ? "px-1" : "-mx-4 px-4 sm:-mx-5 sm:px-5",
            )}
          >
            {dockNotice ? <Notice {...dockNotice} dismiss={dismissProfileNotice} className="text-sm" /> : null}
            {curated && aliasDraft.trim() ? (
              <p className="theme-text-muted flex items-center gap-2 text-xs">
                <Icon icon="lucide:info" size={13} className="theme-text-faint shrink-0" />
                {`"${aliasDraft.trim()}" is typed but not added. Press Enter in the alias field to keep it.`}
              </p>
            ) : null}
            {blocker && isProfileDirty ? (
              <p className="theme-text-muted flex items-center gap-2 text-xs">
                <Icon icon="lucide:info" size={13} className="theme-text-faint shrink-0" />
                {blocker}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={!canSave}
                aria-busy={saving || undefined}
                aria-keyshortcuts={saveShortcut ? "Meta+S Control+S" : undefined}
                onClick={askSave}
              >
                {saving ? "Saving" : onReview ? "Preview publication" : "Save profile"}
                {saveShortcut ? (
                  // The wrapper hides the cap on touch screens; the kbd class sets its own display.
                  <span aria-hidden className="[@media(pointer:coarse)]:hidden">
                    <kbd className="theme-dev-kbd !text-current opacity-70">{saveKeyLabel}</kbd>
                  </span>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!isProfileDirty || saving}
                onClick={discardProfile}
              >
                Discard edits
              </Button>
              <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", isProfileDirty ? "theme-text-secondary" : "theme-text-faint")}>
                {saving ? (
                  "Saving your changes"
                ) : isProfileDirty ? (
                  <>
                    <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
                    Unsaved changes
                  </>
                ) : (
                  "No changes yet"
                )}
              </p>
              {showSaveLine ? (
                // Phones show it once there is something to save, so the resting dock stays one row.
                <span className={cn("min-w-0 sm:ml-auto", !isProfileDirty && "max-sm:hidden")}>
                  <SaveLine model="instant" />
                </span>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>

      {curated ? (
        <div className="mt-10 space-y-10">
          <OrderingPanel
            headingLevel={headingLevel}
            icon="lucide:image"
            title="Works"
            description="Replications credited to this name or its aliases. Curated works lead the gallery on their page; the rest follow newest first."
            items={workItems}
            order={workOrder}
            savedOrder={profile.replicationOrder}
            emptyLabel="No replications are credited to this contributor's name or aliases."
            saveLabel="Save works order"
            saveState={workSaveState}
            saveNote="Saves on its own, not with the profile. Live at once."
            readOnly={!canWrite}
            autoCap={5}
            notice={orderNotice("works")}
            onDismissNotice={() => dismissOrderNotice("works")}
            onOrderChange={changeWorkOrder}
            onSave={() => void saveOrdering("works")}
            onReset={resetWorkOrder}
          />

          <OrderingPanel
            headingLevel={headingLevel}
            icon="lucide:notebook-text"
            title="Reports"
            description="Trip reports credited to this contributor. Curated reports lead their page; the rest follow by trip date, newest first."
            items={reportItems}
            order={reportOrder}
            savedOrder={profile.reportOrder}
            emptyLabel="No trip reports are credited to this contributor."
            saveLabel="Save reports order"
            saveState={reportSaveState}
            saveNote="Saves on its own, not with the profile. Live at once."
            readOnly={!canWrite}
            autoCap={5}
            notice={orderNotice("reports")}
            onDismissNotice={() => dismissOrderNotice("reports")}
            onOrderChange={changeReportOrder}
            onSave={() => void saveOrdering("reports")}
            onReset={resetReportOrder}
          />

          <ContributorDangerZone
            key={profile.key}
            headingLevel={headingLevel}
            canRun={canApprove}
            profileKey={profile.key}
            displayName={profile.displayName}
            directory={directory}
            knownAuthorNames={knownAuthorNames}
            creditedReports={reportItems.length}
            onCompleted={completeDangerOperation}
            onProfileRemoved={removeSelectedProfile}
            resultNotice={dangerNotice}
            onDismissResult={dismissDangerNotice}
          />
        </div>
      ) : null}
    </>
  );
}

/** "Key RIVER · Saved 3 days ago by …": where the record stands. */
export function ProfileFacts({
  profile,
  canEdit,
  className,
}: {
  profile: { key: string; updatedAt: string | null; updatedBy: string | null };
  canEdit: boolean;
  className?: string;
}) {
  return (
    <p className={cn("theme-text-faint flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", className)}>
      <span>
        Key <span className="break-all font-mono">{profile.key}</span>
      </span>
      {profile.updatedAt ? (
        <>
          <span aria-hidden>·</span>
          <span>
            <RelativeDay iso={profile.updatedAt} prefix="Saved" />
            {canEdit && profile.updatedBy ? ` by ${profile.updatedBy}` : ""}
          </span>
        </>
      ) : (
        <>
          <span aria-hidden>·</span>
          <span>Not saved yet</span>
        </>
      )}
    </p>
  );
}

/** The public contributor page, in a new tab. */
export function PublicProfileLink({ profileKey, className }: { profileKey: string; className?: string }) {
  return (
    <a
      href={publicProfileHref(profileKey)}
      target="_blank"
      rel="noopener"
      className={cn(
        "text-dose-accent-strong theme-accent-underline inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline",
        className,
      )}
    >
      View public profile
      <Icon icon="lucide:external-link" size={13} />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
