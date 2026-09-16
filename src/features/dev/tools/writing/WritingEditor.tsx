"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EffectIndexArticlePage } from "@/features/articles/pages/EffectIndexArticlePage";
import { WritingBlogPostPage } from "@/features/blog/pages/WritingBlogPostPage";
import { toWritingBlogPost } from "@/features/blog/domain/writingBlogModel";
import type { ArticleBylineAuthor } from "@/features/articles/domain/articleByline";
import { NarrativeHistory } from "@/features/effects/editing/NarrativeHistory";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { useT } from "@/i18n/client";
import {
  EditorActionStatus,
  EditorField,
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";
import { SearchableMultiPicker } from "@/features/dev/components/SearchablePicker";

import type { WritingDraft } from "./writingEditorModel";
import type { WritingWorkbenchController } from "./useWritingWorkbenchController";

const ADMIN_ONLY_REASON = "Admin role required";

const WRITING_FIELD_LABELS: Record<keyof WritingDraft, string> = {
  title: "Title", slug: "Slug", teaser: "Teaser", coverImageUrl: "Cover image URL",
  body: "Body", bodyFormat: "Body format", tags: "Tags", authorProfileKeys: "Byline",
  status: "Publication state", publicationDate: "Publication date",
};

type WritingEditorProps = {
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading: boolean;
  controller: WritingWorkbenchController;
  /** Admin: the save publishes straight to the site. Without it the editor drafts but cannot save. */
  canApprove: boolean;
  bylineAuthors?: ArticleBylineAuthor[];
  /** A prose-first layout inside the contextual dialog; standalone workbench stays expanded. */
  contextual?: boolean;
};

export function WritingEditor({
  contributorProfiles,
  profilesLoading,
  controller,
  canApprove,
  bylineAuthors = [],
  contextual = false,
}: WritingEditorProps) {
  const t = useT();
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
    setByline,
    save,
  } = controller;
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const metadataId = useId();
  const reviewRef = useRef<HTMLDivElement>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const keepLocalEditsRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (discarding) keepLocalEditsRef.current?.focus();
  }, [discarding]);
  const fingerprint = JSON.stringify([draft, controller.baseline]);
  const changes = (Object.keys(draft) as Array<keyof WritingDraft>).filter(key => JSON.stringify(draft[key]) !== JSON.stringify(controller.baseline[key]));
  useEffect(() => {
    if (reviewed === fingerprint) reviewRef.current?.focus();
  }, [reviewed, fingerprint]);
  const previewAuthors = draft.authorProfileKeys.map(key => {
    const profile = contributorProfiles.find(item => item.key === key);
    return bylineAuthors.find(item => item.key === key) ?? { key, name: profile?.displayName ?? key, href: `/contributors/${key.toLowerCase()}` };
  });
  const previewArticle = { ...controller.loadedRow, title: draft.title, slug: draft.slug, tags: draft.tags.split(",").map(tag => tag.trim()).filter(Boolean), body_raw: draft.body, body_ast: controller.parsedBody.ast, bodyFormat: draft.bodyFormat, shortDescription: draft.teaser, teaser: draft.teaser, coverImageUrl: draft.coverImageUrl, publicationDate: draft.publicationDate };
  // Blog posts lead with a cover image and a teaser; articles do not.
  const emphasiseCover = kind === "blog";
  // Writing rows publish with no review step, so the save is an admin action.
  const saveEnabled = canSave && canApprove && controller.isDirty;
  const bylineOptions = useMemo(
    () =>
      contributorProfiles.map((profile) => ({
        value: profile.key,
        label: profile.displayName,
        hint: `@${profile.key.toLowerCase()}`,
      })),
    [contributorProfiles],
  );

  return (
    <>
      {notice && !(controller.isDirty && notice.tone === "success") ? <EditorNotice notice={notice} /> : null}
      {controller.parsedBody.error ? <EditorNotice notice={{ tone: "danger", message: controller.parsedBody.error }} /> : null}

      {contextual ? <p role="status" className="theme-text-muted text-sm">{controller.isDirty ? "Unpublished local edits" : controller.baseline.status === "published" ? "Public document · no local changes" : "Unpublished document · no local changes"}</p> : null}
      <EditorField label="Title">
        {(control) => (
          <Input
            {...control}
            value={draft.title}
            disabled={readOnly}
            onChange={(event) => updateTitle(event.target.value)}
          />
        )}
      </EditorField>

      {contextual ? <ExpandButton variant="inline" isExpanded={metadataOpen} onToggle={() => setMetadataOpen(value => !value)} ariaControls={metadataId} ariaLabel="Publication details and attribution" label="Publication details and attribution" /> : null}
      <div id={metadataId} className={contextual ? "space-y-4" : "space-y-6"} hidden={contextual && !metadataOpen}>
      <EditorField
        label="Slug"
        description={
          kind === "blog" ? "The post lives at /blog/<slug>." : "The article lives at /articles/<slug>."
        }
        counter={slugStatusLabel(slugAvailability.state)}
      >
        {(control) => (
          <>
            <Input
              {...control}
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
            <Input
              {...control}
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
          <Textarea
            {...control}
            className={contextual ? "leading-6" : "font-mono leading-6"}
            rows={2}
            value={draft.teaser}
            disabled={readOnly}
            onChange={(event) => updateDraft({ teaser: event.target.value })}
          />
        )}
      </EditorField>

      <EditorField label="Byline" description={contributorProfiles.length === 0 && !profilesLoading ? "Contributor profile keys credited on the page, separated by commas." : "Contributor profiles credited on the page. Search by name or profile key."}>
        {(control) =>
          contributorProfiles.length === 0 && !profilesLoading ? (
            <Input {...control} value={draft.authorProfileKeys.join(", ")} disabled={readOnly} onChange={event => setByline(event.target.value.split(",").map(key => key.trim()).filter(Boolean))} placeholder="Contributor profile keys, comma separated" />
          ) : profilesLoading ? (
            <p className="theme-text-faint text-sm">Loading contributors…</p>
          ) : (
            <SearchableMultiPicker
              id={control.id}
              options={bylineOptions}
              value={draft.authorProfileKeys}
              onChange={setByline}
              disabled={readOnly}
              placeholder="Add a contributor"
              emptyText="No contributor matches that."
              ariaLabel="Byline"
            />
          )
        }
      </EditorField>

      <EditorField label="Tags" description="Comma separated.">
        {(control) => (
          <Input
            {...control}
            value={draft.tags}
            disabled={readOnly}
            onChange={(event) => updateDraft({ tags: event.target.value })}
          />
        )}
      </EditorField>

      <EditorField label="Publication date" description="YYYY-MM-DD.">
        {(control) => (
          <Input
            {...control}
            value={draft.publicationDate}
            disabled={readOnly}
            onChange={(event) => updateDraft({ publicationDate: event.target.value })}
          />
        )}
      </EditorField>
      </div>

      <EditorField
        label="Body"
        description={`${draft.bodyFormat === "vcode" ? "VCode, preserved in its original format" : "Markdown"}. Headings become the article's contents rail.`}
        counter={`${draft.body.length} characters`}
      >
        {(control) => (
          <Textarea
            {...control}
            className="font-mono leading-6"
            rows={contextual ? 10 : 20}
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
              { value: "draft", label: "Draft", disabled: readOnly || !canApprove },
              { value: "published", label: "Published", disabled: readOnly || !canApprove },
            ]}
          />
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!saveEnabled}
            title={canApprove ? undefined : ADMIN_ONLY_REASON}
            ref={reviewButtonRef}
            onClick={() => setReviewed(fingerprint)}
          >
            <Icon icon="lucide:save" size={15} />
            Review changes
          </Button>
        </div>
        {saveState === "idle" || (controller.isDirty && saveState !== "saving") ? (
          <EditorStatusPill tone={controller.isDirty || controller.baseline.status !== "published" ? "warning" : "success"}>
            {controller.isDirty ? "Unpublished local edits" : controller.baseline.status === "published" ? "Public" : "Unpublished"}
          </EditorStatusPill>
        ) : (
          <EditorActionStatus status={saveState} />
        )}
      </EditorToolbar>
      {controller.uncertain ? <EditorNotice notice={{ tone: "warning", message: "Publication has not been confirmed. Editing and discard are locked until you explicitly reconcile the original operation.", actions: <Button disabled={saveState === "saving" || !canApprove} onClick={() => void save(draft.status)}>Retry publication confirmation</Button> }} /> : null}
      <EditorToolbar>
        <Button type="button" variant="outline" size="sm" disabled={!!controller.parsedBody.error} onClick={() => setPreview(value => !value)}>{preview ? "Close preview" : "Preview locally"}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={readOnly || !controller.isDirty} onClick={() => setDiscarding(true)}>Discard local edits</Button>
        <Button type="button" variant="ghost" size="sm" disabled={readOnly || !controller.loadedRow} onClick={() => void controller.reconcile()}>Reload published baseline</Button>
      </EditorToolbar>
      {discarding ? <EditorSection headingLevel="h3" title="Discard local edits?" description="This restores the loaded document. Your local changes will be lost."><EditorToolbar><Button ref={keepLocalEditsRef} variant="outline" onClick={() => setDiscarding(false)}>Keep local edits</Button><Button variant="destructive" disabled={readOnly} onClick={() => { controller.discard(); setDiscarding(false); }}>Confirm discard</Button></EditorToolbar></EditorSection> : null}
      {reviewed === fingerprint ? <div ref={reviewRef} tabIndex={-1} aria-label="Review document changes" className="min-w-0 theme-focus-ring"><EditorSection headingLevel="h3" title="Review document changes" description="Only these fields will change. This preview has not been published.">
        {changes.map(key => <div key={key} className="min-w-0 space-y-2"><h4 className="font-semibold">{WRITING_FIELD_LABELS[key]}</h4><div className="grid gap-3 md:grid-cols-2"><div className="min-w-0"><p className="theme-text-muted text-sm">Published baseline</p><pre className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{typeof controller.baseline[key] === "string" ? controller.baseline[key] : JSON.stringify(controller.baseline[key], null, 2)}</pre></div><div className="min-w-0"><p className="theme-text-muted text-sm">Local changes</p><pre className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{typeof draft[key] === "string" ? draft[key] : JSON.stringify(draft[key], null, 2)}</pre></div></div></div>)}
        <Button type="button" variant="accent" disabled={!saveEnabled} onClick={() => void save(draft.status)}>{draft.status === "published" ? "Confirm publication" : "Confirm save as unpublished"}</Button>
        <Button type="button" variant="outline" onClick={() => { setReviewed(null); reviewButtonRef.current?.focus(); }}>Back to editing</Button>
      </EditorSection></div> : null}

      {preview && !controller.parsedBody.error ? <EditorSection
        headingLevel="h3"
        icon="lucide:eye"
        title="Local preview"
        description="The public reading layout. Nothing here is published until you confirm."
      >
        {kind === "blog" ? <WritingBlogPostPage post={toWritingBlogPost(previewArticle, previewAuthors)} /> : <EffectIndexArticlePage article={previewArticle} bylineAuthors={previewAuthors} t={t} />}
      </EditorSection> : null}
      <NarrativeHistory entries={controller.loadedRow?.history ?? []} />
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
