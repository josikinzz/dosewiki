"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCopyIndexSource } from "../useCopyIndexSource";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { EditorNotice, EditorSection, useConfirm } from "@/features/dev/components";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { CopyBlockFields } from "./CopyBlockFields";
import { buildCopyStudioBlocks, draftFromBlock, draftToText, blockCurrentText, type CopyBlockRow } from "./copyStudioUtils";
import { buildTextChangelog } from "@/utils/data/changelog";
import { useCopyIndexOperation } from "../useCopyIndexOperation";
import { proposalSubmittedNotice, submitToolProposal } from "../proposalSubmission";
import { canDraft } from "@/lib/auth/roles";

export default function CopyBlock({ copyKey, children }: { copyKey: string; children?: ReactNode }) {
  const { enabled, mode, role } = useContextualEditing();
  const [open, setOpen] = useState(false);
  if (!enabled || mode !== "edit" || !canDraft(role)) return children;
  return <>{children}<Button variant="ghost" size="sm" aria-label={`Edit ${copyKey} copy`} onClick={() => setOpen(true)}>Edit copy</Button>{open && <CopySession key={copyKey} copyKey={copyKey} close={() => setOpen(false)} />}</>;
}

function CopySession({ copyKey, close }: { copyKey: string; close: () => void }) {
  const source = useCopyIndexSource<{ document: CopyBlockRow | null; revision: number }>(`/api/dev/copy-block?key=${encodeURIComponent(copyKey)}`);
  const live = source.data;
  return live === undefined ? <ContextualEditorPanel title="Loading copy" open onOpenChange={close}>{source.error ? <><p role="alert">{source.error}</p><Button onClick={source.reload}>Retry loading</Button></> : <p role="status">Loading this block…</p>}</ContextualEditorPanel> : <CopyBody copyKey={copyKey} initial={live.document} initialRevision={live.revision} close={close} />;
}
function CopyBody({ copyKey, initial, initialRevision, close }: { copyKey: string; initial: CopyBlockRow | null; initialRevision: number; close: () => void }) {
  const [baseline, setBaseline] = useState(initial);
  const [revision, setRevision] = useState(initialRevision);
  const { serialize: publicationBody, acknowledge, uncertain } = useCopyIndexOperation();
  const block = useMemo(() => buildCopyStudioBlocks(baseline ? [baseline] : []).find((row) => row.key === copyKey), [baseline, copyKey]);
  const [draft, setDraft] = useState(() => block ? draftFromBlock(block) : { body: "", items: [] });
  const [notice, setNotice] = useState("");
  const [proposalId, setProposalId] = useState<string | null>(null);
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
  const requestClose = () => saving || uncertain ? undefined : dirty ? confirm({ title: "Discard unpublished copy?", description: "Only this local draft will be discarded. Published copy is unchanged.", confirmLabel: "Discard draft", destructive: true, onConfirm: close }) : close();
  async function publish() {
    if (!block) return;
    setSaving(true); setNotice(""); setProposalId(null);
    const document = { key: block.key, flavor: block.flavor, kind: block.kind, label: block.label, group: block.group, ...(block.kind === "list" ? { items: previewItems } : { body: draft.body }) };
    try {
      if (!canApprove) {
        const result = await submitToolProposal({ payload: { copyBlocks: [document] }, summary: `Update ${block.label}`, baselines: [{ kind: "copyBlock", key: copyKey, document: baseline }] });
        setProposalId(result.proposalId);
        return;
      }
      const response = await fetch("/api/dev/copy-block", { method: "POST", headers: { "Content-Type": "application/json" }, body: publicationBody({ ...document, expected: baseline, expectedRevision: revision }) });
      const payload = await response.json();
      acknowledge(response, payload);
      setRevision(payload.revision); setBaseline({ ...document, revision: payload.revision }); setNotice(payload.unchanged ? "No publication was needed; this content is unchanged." : payload.replayed ? "Your earlier publication receipt is confirmed. Later public edits may exist." : "Published shared copy. All public renderings of this key are refreshing."); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Publication failed. Your draft is preserved."); }
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
      {notice && <p role="status">{notice}</p>}
      {proposalId && <EditorNotice notice={proposalSubmittedNotice(block.label, proposalId)} />}
      {uncertain && <p role="alert">The publication outcome is unconfirmed. Retry the same publication before closing.</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={!dirty || saving} onClick={() => canApprove ? confirm({ title: "Publish shared copy?", description: `Publish this diff to every rendering of ${copyKey}. This is not page-local.`, confirmLabel: "Publish shared copy", onConfirm: publish }) : void publish()}>{saving ? (canApprove ? "Publishing…" : "Submitting…") : canApprove ? "Publish copy" : "Submit for review"}</Button><Button variant="secondary" disabled={saving} onClick={requestClose}>Cancel</Button></div>
    </div> : <p>No supported block exists for this key.</p>}{dialog}
  </ContextualEditorPanel>;
}
