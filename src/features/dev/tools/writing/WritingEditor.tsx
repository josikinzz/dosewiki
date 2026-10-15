"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EffectIndexArticlePage } from "@/features/articles/pages/EffectIndexArticlePage";
import { WritingBlogPostPage } from "@/features/blog/pages/WritingBlogPostPage";
import { toWritingBlogPost } from "@/features/blog/domain/writingBlogModel";
import type { ArticleBylineAuthor } from "@/features/articles/domain/articleByline";
import { NarrativeHistory } from "@/features/effects/editing/NarrativeHistory";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { useT } from "@/i18n/client";
import {
  EditorActionStatus,
  Notice,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";

import { WRITING_FIELD_LABELS, type WritingDraft } from "./writingEditorModel";
import { WritingFields } from "./WritingFields";
import { WritingRecoveryPanels, WritingSaveTime } from "./WritingRecoveryPanels";
import type { WritingWorkbenchController } from "./useWritingWorkbenchController";


type WritingEditorProps = {
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading: boolean;
  controller: WritingWorkbenchController;
  /** Admin: the save publishes straight to the site. Without it the save is submitted for review as a proposal. */
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
    readOnly,
    canSave,
    updateDraft,
    saveReviewed,
    submitForReview,
  } = controller;
  const [reviewed, setReviewed] = useState<string | null>(null);
  // The workbench opens with the preview beside the form; the contextual
  // dialog is too narrow for two columns, so there it starts closed.
  const [preview, setPreview] = useState(!contextual);
  const [discarding, setDiscarding] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const keepLocalEditsRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (discarding) keepLocalEditsRef.current?.focus();
  }, [discarding]);
  const fingerprint = controller.reviewedSaveCommand.body;
  const changes = (Object.keys(draft) as Array<keyof WritingDraft>).filter(key => JSON.stringify(draft[key]) !== JSON.stringify(controller.baseline[key]));
  useEffect(() => {
    if (reviewed === fingerprint) reviewRef.current?.focus();
  }, [reviewed, fingerprint]);
  const previewAuthors = draft.authorProfileKeys.map(key => {
    const profile = contributorProfiles.find(item => item.key === key);
    return bylineAuthors.find(item => item.key === key) ?? { key, name: profile?.displayName ?? key, href: `/contributors/${key.toLowerCase()}` };
  });
  const previewArticle = { ...controller.loadedRow, title: draft.title, slug: draft.slug, tags: draft.tags, body_raw: draft.body, body_ast: controller.parsedBody.ast, bodyFormat: draft.bodyFormat, shortDescription: draft.teaser, teaser: draft.teaser, coverImageUrl: draft.coverImageUrl, publicationDate: draft.publicationDate };
  const saveEnabled = canSave && controller.isDirty;

  return (
    <>
      {notice && !(controller.isDirty && notice.tone === "success") ? <Notice {...notice} /> : null}
      {controller.parsedBody.error ? <Notice tone="danger" message={controller.parsedBody.error} /> : null}
      <WritingRecoveryPanels controller={controller} fieldLabels={WRITING_FIELD_LABELS} />

      {contextual ? <p role="status" className="theme-text-muted text-sm">{controller.isDirty ? "Unsaved changes" : controller.baseline.status === "published" ? "Public document · no unsaved changes" : "Unpublished document · no unsaved changes"}</p> : null}
      <EditorToolbar label="Preview">
        <Button type="button" variant="outline" size="sm" aria-pressed={preview} onClick={() => setPreview(value => !value)}>
          <Icon icon={preview ? "lucide:eye" : "lucide:eye-off"} size={15} />
          Live preview
        </Button>
        <span className="theme-text-faint text-xs">
          {preview ? "Updates as you type. Nothing here is published until you save." : "Show the reading layout beside the form."}
        </span>
      </EditorToolbar>

      {/* Form and preview side by side from `lg:`; below that the preview follows the form. */}
      <div className={preview && !contextual ? "grid gap-6 lg:grid-cols-2 lg:items-start" : undefined}>
      <div className={contextual ? "min-w-0 space-y-4" : "min-w-0 space-y-6"}>
      <WritingFields
        controller={controller}
        contributorProfiles={contributorProfiles}
        profilesLoading={profilesLoading}
        canApprove={canApprove}
        contextual={contextual}
      />

      <EditorToolbar variant="split">
        <div className="flex flex-wrap items-center gap-2">
          {/* An editor proposes the state too; an admin's approval applies it. */}
          <EditorSegmentedControl
            label="Publication state"
            value={draft.status}
            onChange={(value) => updateDraft({ status: value as WritingDraft["status"] })}
            options={[
              { value: "draft", label: "Draft", disabled: readOnly },
              { value: "published", label: "Published", disabled: readOnly },
            ]}
          />
          {canApprove ? (
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={!saveEnabled}
              ref={reviewButtonRef}
              onClick={() => setReviewed(fingerprint)}
            >
              <Icon icon="lucide:save" size={15} />
              Review changes
            </Button>
          ) : (
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={!saveEnabled}
              onClick={() => void submitForReview()}
            >
              <Icon icon="lucide:send" size={15} />
              {saveState === "saving" ? "Submitting" : "Submit for review"}
            </Button>
          )}
        </div>
        {saveState === "idle" || (controller.isDirty && saveState !== "saving") ? (
          <EditorStatusPill tone={controller.isDirty || controller.baseline.status !== "published" ? "warning" : "success"}>
            {controller.isDirty ? "Unsaved changes" : controller.baseline.status === "published" ? "Public" : "Unpublished"}
          </EditorStatusPill>
        ) : (
          <EditorActionStatus status={saveState} />
        )}
      </EditorToolbar>
      <WritingSaveTime controller={controller} />
      {controller.uncertain ? <Notice tone="warning" message="Publication has not been confirmed. Editing and discard are locked until you retry the original publication." actions={<Button disabled={saveState === "saving" || !canApprove} onClick={() => void controller.retrySave()}>Retry publication confirmation</Button>} /> : null}
      <EditorToolbar>
        <Button type="button" variant="ghost" size="sm" disabled={readOnly || !controller.isDirty} onClick={() => setDiscarding(true)}>Discard local edits</Button>
        <Button type="button" variant="ghost" size="sm" disabled={readOnly || !controller.loadedRow} onClick={() => void controller.reconcile()}>Load the latest saved version</Button>
      </EditorToolbar>
      {discarding ? <EditorSection headingLevel="h3" title="Discard local edits?" description="This restores the loaded document. Your local changes will be lost."><EditorToolbar><Button ref={keepLocalEditsRef} variant="outline" onClick={() => setDiscarding(false)}>Keep local edits</Button><Button variant="destructive" disabled={readOnly} onClick={() => { controller.discard(); setDiscarding(false); }}>Confirm discard</Button></EditorToolbar></EditorSection> : null}
      {canApprove && reviewed === fingerprint ? <div ref={reviewRef} tabIndex={-1} aria-label="Review document changes" className="min-w-0 theme-focus-ring"><EditorSection headingLevel="h3" title="Review document changes" description="Only these fields will change. This preview has not been published.">
        {changes.map(key => <div key={key} className="min-w-0 space-y-2"><h4 className="font-semibold">{WRITING_FIELD_LABELS[key]}</h4><div className="grid gap-3 md:grid-cols-2"><div className="min-w-0"><p className="theme-text-muted text-sm">Saved version</p><pre className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{typeof controller.baseline[key] === "string" ? controller.baseline[key] : JSON.stringify(controller.baseline[key], null, 2)}</pre></div><div className="min-w-0"><p className="theme-text-muted text-sm">Your changes</p><pre className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{typeof draft[key] === "string" ? draft[key] : JSON.stringify(draft[key], null, 2)}</pre></div></div></div>)}
        <Button type="button" variant="accent" disabled={!saveEnabled} onClick={() => void saveReviewed(controller.reviewedSaveCommand)}>{draft.status === "published" ? "Confirm publication" : "Confirm save as unpublished"}</Button>
        <Button type="button" variant="outline" onClick={() => { setReviewed(null); reviewButtonRef.current?.focus(); }}>Back to editing</Button>
      </EditorSection></div> : null}
      </div>

      {preview ? (
        <section aria-label="Preview" className="min-w-0 space-y-3 lg:sticky lg:top-4">
          <p className="theme-text-faint text-xs">Preview of the public reading layout.</p>
          {controller.parsedBody.error ? (
            <p className="theme-text-muted text-sm">Fix the body markup to see the preview.</p>
          ) : kind === "blog" ? (
            <WritingBlogPostPage post={toWritingBlogPost(previewArticle, previewAuthors)} embedded />
          ) : (
            <EffectIndexArticlePage article={previewArticle} bylineAuthors={previewAuthors} t={t} embedded />
          )}
        </section>
      ) : null}
      </div>
      <NarrativeHistory entries={controller.loadedRow?.history ?? []} />
    </>
  );
}

