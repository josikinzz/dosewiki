"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { AboutMissionMarkdown } from "@/components/pages/AboutMissionMarkdown";
import { applyPlaceholders } from "@/data/content/about";
import { splitAboutMarkdown } from "@/data/content/aboutSections";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { EditorNotice, EditorSection, EditorToolbar, useConfirm } from "@/features/dev/components";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { AboutCopyEditors } from "./AboutCopyEditors";
import { useAboutEditorController } from "./useAboutEditorController";
import { canDraft } from "@/lib/auth/roles";

export default function AboutBlock({ children, placeholderValues = {}, label = "Edit About copy" }: { children?: ReactNode; placeholderValues?: Record<string, string>; label?: string }) {
  const { enabled, mode, role } = useContextualEditing();
  const [open, setOpen] = useState(false);
  if (!enabled || mode !== "edit" || !canDraft(role)) return children;
  return <>{children}<Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{label}</Button>{open && <AboutSession close={() => setOpen(false)} placeholderValues={placeholderValues} />}</>;
}
function AboutSession({ close, placeholderValues }: { close: () => void; placeholderValues: Record<string, string> }) {
  const { role, setDirty, registerDraftGuard } = useContextualEditing();
  const canApprove = role === "admin";
  const editor = useAboutEditorController({ canApprove, placeholderValues });
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const subtitleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const { introduction, sources, history } = splitAboutMarkdown(applyPlaceholders(editor.draft.markdown, placeholderValues));
  useEffect(() => { setDirty("about-copy", editor.isDirty); return () => setDirty("about-copy", false); }, [editor.isDirty, setDirty]);
  useEffect(() => registerDraftGuard("about-copy", { discard: close, canDiscard: editor.saveState !== "saving" && !editor.publicationUncertain }), [close, editor.saveState, editor.publicationUncertain, registerDraftGuard]);
  const cancel = () => editor.saveState === "saving" || editor.publicationUncertain ? undefined : editor.isDirty ? confirm({ title: "Discard About draft?", description: "Published copy will not change.", confirmLabel: "Discard draft", cancelLabel: "Keep editing", destructive: true, onConfirm: close }) : close();
  return <ContextualEditorPanel title="Edit About copy" description="Edit dose.wiki /about copy, subtitle, and search metadata. Effect Index's About copy is unchanged." open onOpenChange={cancel}>
    {editor.isLoaded ? <div className="space-y-6">
      <EditorToolbar variant="split">
        <p role="status" className="theme-text-muted text-sm">{editor.isDirty ? "Unpublished local changes" : "No local changes"}</p>
        <Button variant="outline" size="sm" onClick={() => previewRef.current?.focus()}>Preview and review</Button>
      </EditorToolbar>
      <fieldset className="space-y-6" disabled={editor.saveState === "saving" || editor.publicationUncertain}>
      <AboutCopyEditors contextual aboutMarkdown={editor.draft.markdown} onMarkdownChange={(event) => editor.replaceMarkdown(event.target.value)} onResetMarkdown={() => confirm({ title: "Reset About copy?", description: "Replace your local About copy changes with the loaded source. Published copy will not change.", confirmLabel: "Reset About copy", cancelLabel: "Keep editing", destructive: true, onConfirm: () => { editor.resetMarkdown(); textareaRef.current?.focus(); } })} onCopyMarkdown={editor.copyMarkdown} isMarkdownDirty={editor.draft.markdown !== editor.original.markdown} textareaRef={textareaRef} aboutSubtitle={editor.draft.subtitle} onSubtitleChange={(event) => editor.replaceSubtitle(event.target.value)} onResetSubtitle={() => confirm({ title: "Reset subtitle and description?", description: "Replace your local subtitle and search-description changes with the loaded source. Published copy will not change.", confirmLabel: "Reset subtitle and description", cancelLabel: "Keep editing", destructive: true, onConfirm: () => { editor.resetSubtitle(); subtitleTextareaRef.current?.focus(); } })} onCopySubtitle={editor.copySubtitle} isSubtitleDirty={editor.draft.subtitle !== editor.original.subtitle} subtitleLength={editor.draft.subtitle.length} subtitleTextareaRef={subtitleTextareaRef} copyNotice={editor.copyNotice} />
      </fieldset>
      <div ref={previewRef} tabIndex={-1} aria-label="Local About preview and review" className="min-w-0 space-y-6 theme-focus-ring">
        <EditorSection headingLevel="h3" title="Local preview" description="Rendered with live count placeholders. Nothing here has been published.">
          <p>{applyPlaceholders(editor.draft.subtitle, placeholderValues)}</p>
          <section className="space-y-6">
            <h4 className="theme-text-primary text-lg font-semibold">Introduction</h4>
            <AboutMissionMarkdown content={introduction} />
          </section>
          {sources ? <section className="space-y-6">
            <h4 className="theme-text-primary text-lg font-semibold">Sources and review</h4>
            <AboutMissionMarkdown content={sources} />
          </section> : null}
          {history ? <section className="space-y-6">
            <h4 className="theme-text-primary text-lg font-semibold">Founders &amp; Contributors</h4>
            <h5 className="theme-text-primary text-lg font-semibold">Project history</h5>
            <AboutMissionMarkdown content={history} />
          </section> : null}
        </EditorSection>
        <EditorSection headingLevel="h3" title="Review changes" description="Compare local copy with the loaded source before publishing or submitting.">
          {editor.isDirty ? <DiffPreview diffText={[editor.draft.markdown !== editor.original.markdown ? editor.markdownDiff : "", editor.draft.subtitle !== editor.original.subtitle ? editor.subtitleDiff : ""].filter(Boolean).join("\n")} /> : <p className="theme-text-muted text-sm">No local changes to review.</p>}
        </EditorSection>
        <Button variant="outline" size="sm" onClick={() => textareaRef.current?.focus()}>Back to source</Button>
      </div>
      {editor.notice && <EditorNotice notice={editor.notice} />}
      {editor.publicationUncertain && <p role="alert">The publication outcome is not confirmed. Retry the same publication before closing or changing the draft.</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={!editor.isDirty || editor.saveState === "saving"} onClick={() => canApprove ? confirm({ title: "Publish About copy?", description: "Publish the displayed diff to dose.wiki /about and its search metadata. Founder selection is unchanged.", confirmLabel: "Publish About copy", onConfirm: async () => { await editor.save(); router.refresh(); } }) : void editor.save()}>{editor.saveState === "saving" ? (canApprove ? "Publishing…" : "Submitting…") : editor.publicationUncertain ? "Retry publication confirmation" : canApprove ? "Publish About copy" : "Submit for review"}</Button><Button variant="secondary" disabled={editor.saveState === "saving" || editor.publicationUncertain} onClick={cancel}>Cancel</Button></div>
    </div> : editor.loadError ? <><p role="alert">{editor.loadError}</p><Button onClick={editor.reloadSource}>Retry loading</Button></> : <p role="status">Loading About source…</p>}{dialog}
  </ContextualEditorPanel>;
}
