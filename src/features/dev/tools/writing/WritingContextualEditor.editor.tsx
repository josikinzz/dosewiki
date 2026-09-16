"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { EditorNotice, EditorSection, EditorToolbar } from "@/features/dev/components";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { WritingEditor } from "./WritingEditor";
import { useWritingWorkbenchController } from "./useWritingWorkbenchController";
import type { WritingKind } from "./writingEditorModel";
import type { ArticleBylineAuthor } from "@/features/articles/domain/articleByline";
import { canDraft } from "@/lib/auth/roles";

type Props = { slug: string; writingKind: WritingKind; bylineAuthors?: ArticleBylineAuthor[] };
export default function WritingContextualEditor(props: Props) {
  const { enabled, mode, role } = useContextualEditing();
  const [started, setStarted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (!enabled || mode !== "edit" || !canDraft(role)) return null;
  if (!started) return <Button variant="outline" onClick={() => setStarted(true)}>Edit {props.writingKind === "blog" ? "post" : "writing"}</Button>;
  return <WritingSession key={`${props.writingKind}:${props.slug}:${attempt}`} {...props} onRetry={() => setAttempt(value => value + 1)} />;
}
function WritingSession({ slug, writingKind, bylineAuthors, onRetry }: Props & { onRetry: () => void }) {
  const { role, setDirty, registerDraftGuard } = useContextualEditing();
  const router = useRouter();
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(true);
  const [closing, setClosing] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (closing) keepEditingRef.current?.focus();
  }, [closing]);
  const controller = useWritingWorkbenchController({ initialSelection: slug, initialKind: writingKind, contextual: true });
  const key = `writing:${writingKind}:${slug}`;
  useEffect(() => { setDirty(key, controller.isDirty); return () => setDirty(key, false); }, [key, controller.isDirty, setDirty]);
  useEffect(() => registerDraftGuard(key, { discard: controller.discard, canDiscard: !controller.uncertain && controller.saveState !== "saving" }), [key, controller.discard, controller.uncertain, controller.saveState, registerDraftGuard]);
  useEffect(() => { if (controller.saveState === "saved") router.refresh(); }, [controller.saveState, router]);
  return <>
    <Button ref={returnFocusRef} variant="outline" onClick={() => setOpen(true)}>Edit {writingKind === "blog" ? "post" : "writing"}</Button>
    <ContextualEditorPanel title={`Edit ${writingKind === "blog" ? "post" : "writing"}`} open={open} returnFocusRef={returnFocusRef} onOpenChange={next => { if (!next && (controller.saveState === "saving" || controller.uncertain)) return; if (!next && controller.isDirty) setClosing(true); else setOpen(next); }} description={`Changes stay local until an admin confirms saving or publication. Publishes to ${writingKind === "blog" ? "dose.wiki" : "dose.wiki and Effect Index"}.`}>
      {closing ? (
        <EditorSection title="Discard local edits?" description="Your changes have not been saved. Keep editing to preserve them.">
          <EditorToolbar>
            <Button ref={keepEditingRef} variant="outline" onClick={() => setClosing(false)}>Keep editing</Button>
            <Button variant="destructive" disabled={controller.uncertain || controller.saveState === "saving"} onClick={() => { if (controller.uncertain || controller.saveState === "saving") return; controller.discard(); setClosing(false); setOpen(false); }}>Discard and close</Button>
          </EditorToolbar>
        </EditorSection>
      ) : controller.isLoadingRow ? <p role="status">Loading writing…</p> : !controller.loadedRow ? (
        <EditorSection title="Writing could not be loaded" description="Retry loading before making changes.">
          {controller.notice ? <EditorNotice notice={controller.notice} /> : null}
          <EditorToolbar><Button onClick={onRetry}>Retry loading</Button><Button variant="outline" onClick={() => setOpen(false)}>Close editor</Button></EditorToolbar>
        </EditorSection>
      ) : <WritingEditor contextual contributorProfiles={[]} profilesLoading={false} controller={controller} canApprove={role === "admin"} bylineAuthors={bylineAuthors} />}
    </ContextualEditorPanel>
  </>;
}
