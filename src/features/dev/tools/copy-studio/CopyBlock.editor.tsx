"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { Notice, EditorSection, useConfirm, type NoticeMessage } from "@/features/dev/components";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { CopyBlockFields } from "./CopyBlockFields";
import { buildCopyStudioBlocks, copyBlockDocument, draftFromBlock, draftToText, blockCurrentText, type CopyBlockRow } from "./copyStudioUtils";
import { buildTextChangelog } from "@/data/changelog/diff";
import { CopyIndexRefusal } from "../useCopyIndexOperation";
import { copyConflictNotice, LOADED_LATEST_NOTICE, proposeCopyBlock, useCopyBlockSource, useCopyBlockWrites, type CopyBlockSnapshot } from "./useCopyBlockWrites";
import { proposalSubmittedNotice } from "../proposalSubmission";
import { canDraft } from "@/lib/auth/roles";

export default function CopyBlock({ copyKey, children }: { copyKey: string; children?: ReactNode }) {
  const { enabled, mode, role } = useContextualEditing();
  const [open, setOpen] = useState(false);
  if (!enabled || mode !== "edit" || !canDraft(role)) return children;
  return <>{children}<Button variant="ghost" size="sm" aria-label={`Edit ${copyKey} copy`} onClick={() => setOpen(true)}>Edit copy</Button>{open && <CopySession key={copyKey} copyKey={copyKey} close={() => setOpen(false)} />}</>;
}

const blockFor = (key: string, document: CopyBlockRow | null) => buildCopyStudioBlocks(document ? [document] : []).find((row) => row.key === key);

function CopySession({ copyKey, close }: { copyKey: string; close: () => void }) {
  const source = useCopyBlockSource(copyKey);
  const live = source.data;
  const loadFailure = source.error ? <><p role="alert">{source.error}</p><Button onClick={source.reload}>Retry loading</Button></> : null;
  return live === undefined ? <ContextualEditorPanel title="Loading copy" open onOpenChange={close}>{loadFailure ?? <p role="status">Loading this block</p>}</ContextualEditorPanel> : <CopyBody copyKey={copyKey} live={live} reload={source.reload} loadFailure={loadFailure} close={close} />;
}
function CopyBody({ copyKey, live, reload, loadFailure, close }: { copyKey: string; live: CopyBlockSnapshot; reload: () => void; loadFailure: ReactNode; close: () => void }) {
  const [baseline, setBaseline] = useState(live.document);
  const [revision, setRevision] = useState(live.revision);
  const { publish: publishCopy, uncertain } = useCopyBlockWrites();
  const block = useMemo(() => blockFor(copyKey, baseline), [baseline, copyKey]);
  const [draft, setDraft] = useState(() => block ? draftFromBlock(block) : { body: "", items: [] });
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const replaceOnNext = useRef<CopyBlockSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const { role, setDirty, registerDraftGuard } = useContextualEditing();
  const canApprove = role === "admin";
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const text = block ? draftToText(block.kind, draft) : "";
  const previewItems = draft.items.map((item) => item.trim()).filter(Boolean);
  const dirty = !!block && text !== blockCurrentText(block);
  useEffect(() => { setDirty(`copy:${copyKey}`, dirty); return () => setDirty(`copy:${copyKey}`, false); }, [copyKey, dirty, setDirty]);
  useEffect(() => registerDraftGuard(`copy:${copyKey}`, { discard: close, canDiscard: !saving && !uncertain }), [close, copyKey, saving, uncertain, registerDraftGuard]);
  useEffect(() => {
    if (!replaceOnNext.current || replaceOnNext.current === live) return;
    replaceOnNext.current = null;
    const latest = blockFor(copyKey, live.document);
    setBaseline(live.document); setRevision(live.revision); setDraft(latest ? draftFromBlock(latest) : { body: "", items: [] });
  }, [copyKey, live]);
  const loadLatest = () => { replaceOnNext.current = live; reload(); };
  const requestClose = () => saving || uncertain ? undefined : dirty ? confirm({ title: "Discard unpublished copy?", description: "Only this local draft will be discarded. Published copy is unchanged.", confirmLabel: "Discard draft", destructive: true, onConfirm: close }) : close();
  async function publish() {
    if (!block) return;
    setSaving(true); setNotice(null);
    const document = copyBlockDocument(block, draft);
    try {
      if (!canApprove) {
        const result = await proposeCopyBlock(document, baseline, `Update ${block.label}`);
        setDraft(draftFromBlock(block));
        setNotice(proposalSubmittedNotice(block.label, result.proposalId));
        return;
      }
      const receipt = await publishCopy(document, baseline, revision);
      if (receipt.replayed) loadLatest();
      else { setRevision(receipt.revision); setBaseline({ ...document, revision: receipt.revision }); }
      setNotice({ tone: "success", message: receipt.unchanged ? "No publication was needed; this content is unchanged." : receipt.replayed ? "Your earlier publication went through. Someone may have published changes since." : `Published “${block.label}”. The public pages reading this key are refreshing with it now.` }); router.refresh();
    } catch (error) {
      setNotice(error instanceof CopyIndexRefusal && error.conflict
        ? copyConflictNotice(confirm, () => { loadLatest(); setNotice(LOADED_LATEST_NOTICE); })
        : { tone: "danger", message: error instanceof Error ? error.message : "Publication failed. Your draft is preserved." });
    }
    finally { setSaving(false); }
  }
  return <ContextualEditorPanel title={block?.label ?? "Copy unavailable"} description={`Shared block: ${copyKey}. Publication changes every page and publication that reads this exact key${block?.flavor ? ` (${block.flavor} only)` : ""}.`} open onOpenChange={requestClose}>
    {block ? <div className="space-y-6"><fieldset disabled={saving || uncertain}><CopyBlockFields kind={block.kind} draft={draft} onChange={setDraft} /></fieldset>
      <EditorSection title="Local preview" headingLevel="h3" animate={false} aria-label="Local preview">
        {block.kind === "list" ? (
          previewItems.length > 0 ? <ul className="list-disc space-y-1 pl-5 break-words">{previewItems.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="theme-text-muted text-sm">No items will be published.</p>
        ) : !text.trim() ? <p className="theme-text-muted text-sm">This block will be empty.</p> : block.kind === "markdown" ? <PublicMarkdownBody content={text} /> : <p className="whitespace-pre-wrap break-words">{text}</p>}
      </EditorSection>
      <EditorSection title="Changes" headingLevel="h3" animate={false} description={dirty ? "Removed lines begin with −; added lines begin with +." : undefined}>
        {dirty ? <DiffPreview diffText={buildTextChangelog(block.label, blockCurrentText(block), text).markdown} /> : <p className="theme-text-muted text-sm">No pending changes.</p>}
      </EditorSection>
      {notice && <Notice {...notice} />}
      {loadFailure}
      {uncertain && <p role="alert">The publication outcome is unconfirmed. Retry the same publication before closing.</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={!dirty || saving} onClick={() => canApprove ? confirm({ title: `Publish “${block?.label ?? copyKey}”?`, description: `Every public page that reads ${copyKey} changes at once, not only this one. There is no draft step.`, confirmLabel: "Publish copy", onConfirm: publish }) : void publish()}>{saving ? (canApprove ? "Publishing" : "Submitting") : canApprove ? "Publish copy" : "Submit for review"}</Button><Button variant="secondary" disabled={saving} onClick={requestClose}>Cancel</Button></div>
    </div> : <p>No supported block exists for this key.</p>}{dialog}
  </ContextualEditorPanel>;
}
