"use client";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorActionStatus,
  EditorField,
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";

import type { WritingDraft } from "./writingEditorModel";
import type { WritingWorkbenchController } from "./useWritingWorkbenchController";

const INPUT_CLASS =
  "theme-editor-field w-full rounded-lg border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2 text-sm theme-text-primary transition focus:outline-none focus:ring-2";
const TEXTAREA_CLASS =
  "theme-editor-field w-full rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2.5 font-mono text-[0.8125rem] leading-6 theme-text-primary transition focus:outline-none focus:ring-2";

const ADMIN_ONLY_REASON = "Admin role required";

type WritingEditorProps = {
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading: boolean;
  controller: WritingWorkbenchController;
  /** Admin: the save publishes straight to the site. Without it the editor drafts but cannot save. */
  canApprove: boolean;
};

export function WritingEditor({
  contributorProfiles,
  profilesLoading,
  controller,
  canApprove,
}: WritingEditorProps) {
  const {
    kind,
    draft,
    saveState,
    notice,
    slugAvailability,
    readOnly,
    canSave,
    updateTitle,
    updateSlug,
    updateDraft,
    toggleByline,
    save,
  } = controller;
  // Blog posts lead with a cover image and a teaser; articles do not.
  const emphasiseCover = kind === "blog";
  // Writing rows publish with no review step, so the save is an admin action.
  const saveEnabled = canSave && canApprove;

  return (
    <>
      {notice ? <EditorNotice notice={notice} /> : null}
      {readOnly ? (
        <EditorNotice
          notice={{
            tone: "warning",
            title: "Read-only",
            message:
              "This is an archived VCode article. This editor writes Markdown, so it will not rewrite the body it cannot speak.",
          }}
        />
      ) : null}

      <EditorField label="Title">
        {(control) => (
          <input
            {...control}
            className={INPUT_CLASS}
            value={draft.title}
            disabled={readOnly}
            onChange={(event) => updateTitle(event.target.value)}
          />
        )}
      </EditorField>

      <EditorField
        label="Slug"
        description={
          kind === "blog" ? "The post lives at /blog/<slug>." : "The article lives at /articles/<slug>."
        }
        counter={slugStatusLabel(slugAvailability.state)}
      >
        {(control) => (
          <>
            <input
              {...control}
              className={INPUT_CLASS}
              value={draft.slug}
              disabled={readOnly}
              onChange={(event) => updateSlug(event.target.value)}
            />
            {"message" in slugAvailability ? (
              <p className="theme-text-faint mt-1.5 text-xs">{slugAvailability.message}</p>
            ) : null}
          </>
        )}
      </EditorField>

      {emphasiseCover ? (
        <EditorField
          label="Cover image URL"
          description="Shown on the blog index card and above the post."
        >
          {(control) => (
            <input
              {...control}
              className={INPUT_CLASS}
              value={draft.coverImageUrl}
              disabled={readOnly}
              onChange={(event) => updateDraft({ coverImageUrl: event.target.value })}
            />
          )}
        </EditorField>
      ) : null}

      <EditorField
        label="Teaser"
        description={
          emphasiseCover
            ? "The standfirst under the title, and the blurb on the index card."
            : "One or two sentences, shown under the title and in listings."
        }
        counter={`${draft.teaser.length} characters`}
      >
        {(control) => (
          <textarea
            {...control}
            className={TEXTAREA_CLASS}
            rows={2}
            value={draft.teaser}
            disabled={readOnly}
            onChange={(event) => updateDraft({ teaser: event.target.value })}
          />
        )}
      </EditorField>

      <EditorField label="Byline" description="Contributor profiles credited on the page.">
        {profilesLoading ? (
          <p className="theme-text-faint text-sm">Loading contributors…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {contributorProfiles.map((profile) => {
              const active = draft.authorProfileKeys.includes(profile.key);
              return (
                <Button
                  key={profile.key}
                  type="button"
                  size="sm"
                  variant={active ? "accent" : "secondary"}
                  disabled={readOnly}
                  onClick={() => toggleByline(profile.key)}
                >
                  {profile.displayName}
                </Button>
              );
            })}
          </div>
        )}
      </EditorField>

      <EditorField label="Tags" description="Comma separated.">
        {(control) => (
          <input
            {...control}
            className={INPUT_CLASS}
            value={draft.tags}
            disabled={readOnly}
            onChange={(event) => updateDraft({ tags: event.target.value })}
          />
        )}
      </EditorField>

      <EditorField label="Publication date" description="YYYY-MM-DD.">
        {(control) => (
          <input
            {...control}
            className={INPUT_CLASS}
            value={draft.publicationDate}
            disabled={readOnly}
            onChange={(event) => updateDraft({ publicationDate: event.target.value })}
          />
        )}
      </EditorField>

      <EditorField
        label="Body"
        description="Markdown. Headings become the article's contents rail."
        counter={`${draft.body.length} characters`}
      >
        {(control) => (
          <textarea
            {...control}
            className={TEXTAREA_CLASS}
            rows={20}
            value={draft.body}
            disabled={readOnly}
            onChange={(event) => updateDraft({ body: event.target.value })}
          />
        )}
      </EditorField>

      <EditorToolbar variant="split">
        <div className="flex flex-wrap items-center gap-2">
          {/* Follows the save button: a state that cannot be saved is not a choice. */}
          <EditorSegmentedControl
            label="Publication state"
            value={draft.status}
            onChange={(value) => updateDraft({ status: value as WritingDraft["status"] })}
            options={[
              { value: "draft", label: "Draft", disabled: !saveEnabled },
              { value: "published", label: "Published", disabled: !saveEnabled },
            ]}
          />
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!saveEnabled}
            title={canApprove ? undefined : ADMIN_ONLY_REASON}
            onClick={() => void save(draft.status)}
          >
            <Icon icon="lucide:save" size={15} />
            {draft.status === "published" ? "Save & publish" : "Save draft"}
          </Button>
        </div>
        {saveState === "idle" ? (
          <EditorStatusPill tone={draft.status === "published" ? "success" : "warning"}>
            {draft.status === "published" ? "Public" : "Draft, not public"}
          </EditorStatusPill>
        ) : (
          <EditorActionStatus status={saveState} />
        )}
      </EditorToolbar>

      <EditorSection
        headingLevel="h3"
        icon="lucide:eye"
        title="Preview"
        description="Rendered with the same Markdown components the public page uses."
      >
        <PublicMarkdownBody content={draft.body} />
      </EditorSection>
    </>
  );
}

function slugStatusLabel(state: string): string {
  switch (state) {
    case "free":
      return "Available";
    case "current":
      return "Current slug";
    case "taken":
      return "Taken";
    case "invalid":
      return "Invalid";
    default:
      return "";
  }
}
