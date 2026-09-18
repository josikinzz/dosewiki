"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { SubstanceArticle, SubstancePriority } from "@/schema";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { ArticleDisplayNameInput, ArticlePrioritySelect } from "@/features/dev/forms/ArticleDisplayFields";
import { EditorField, EditorNotice, useConfirm } from "@/features/dev/components";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { buildTextChangelog } from "@/utils/data/changelog";
import { proposalSubmittedNotice } from "../proposalSubmission";
import { canDraft } from "@/lib/auth/roles";

const OPEN_EVENT = "dosewiki:edit-index-item";
type Source = { article: SubstanceArticle; baseHash: string; draft: unknown };
type ItemSelection = { slug: string; returnFocusTarget: HTMLElement };
export default function IndexItem({ slug, name }: { slug?: string; name?: string }) {
  const { enabled, mode, role } = useContextualEditing();
  const pathname = usePathname();
  const [selected, setSelected] = useState<ItemSelection | null>(null);
  const allowed = enabled && mode === "edit" && canDraft(role) && !!pathname?.startsWith("/substances");
  useEffect(() => {
    if (slug || !allowed) return;
    const open = (event: Event) => { const value = (event as CustomEvent<ItemSelection>).detail; if (value && typeof value.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) && value.returnFocusTarget instanceof HTMLElement) setSelected((current) => current ?? value); };
    window.addEventListener(OPEN_EVENT, open); return () => window.removeEventListener(OPEN_EVENT, open);
  }, [allowed, slug]);
  if (!allowed) return null;
  if (slug) return <Button variant="ghost" size="sm" aria-label={`Edit ${name ?? slug} display metadata`} onClick={(event) => window.dispatchEvent(new CustomEvent<ItemSelection>(OPEN_EVENT, { detail: { slug, returnFocusTarget: event.currentTarget } }))}>Edit</Button>;
  return selected ? <ItemSession key={selected.slug} slug={selected.slug} returnFocusTarget={selected.returnFocusTarget} close={() => setSelected(null)} /> : null;
}
function ItemSession({ slug, returnFocusTarget, close }: { slug: string; returnFocusTarget: HTMLElement; close: () => void }) {
  const returnFocusRef = useRef<HTMLElement | null>(returnFocusTarget);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/dev/article-lifecycle?slug=${encodeURIComponent(slug)}`, { cache: "no-store", signal: abort.signal }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load this index item."); setSource(data);
    }).catch((failure) => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load this index item."); });
    return () => abort.abort();
  }, [slug]);
  return source ? <ItemBody initial={source} slug={slug} returnFocusRef={returnFocusRef} close={close} /> : <ContextualEditorPanel title="Load index item" open returnFocusRef={returnFocusRef} onOpenChange={close}><p role="status">{error || "Loading the selected canonical article…"}</p><Button variant="secondary" onClick={close}>Close</Button></ContextualEditorPanel>;
}
function ItemBody({ initial, slug, returnFocusRef, close }: { initial: Source; slug: string; returnFocusRef: RefObject<HTMLElement | null>; close: () => void }) {
  const [source, setSource] = useState(initial);
  const [name, setName] = useState(initial.article.identification?.common_name || initial.article.title);
  const [priority, setPriority] = useState<SubstancePriority>(initial.article.priority ?? "normal");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [proposalId, setProposalId] = useState<string | null>(null);
  const pending = useRef<{ identity: string; changeId: string; kind: "name" | "visibility" } | null>(null);
  const lock = useRef(false);
  const router = useRouter();
  const { role, setDirty, registerDraftGuard } = useContextualEditing();
  const canApprove = role === "admin";
  const { confirm, dialog } = useConfirm();
  const currentName = source.article.identification?.common_name || source.article.title;
  const nameDirty = name !== currentName;
  const visibilityDirty = priority !== (source.article.priority ?? "normal");
  const dirty = nameDirty || visibilityDirty;
  useEffect(() => { setDirty(`index-item:${slug}`, dirty); return () => setDirty(`index-item:${slug}`, false); }, [slug, dirty, setDirty]);
  useEffect(() => registerDraftGuard(`index-item:${slug}`, { discard: close, canDiscard: !busy && !uncertain }), [close, slug, busy, uncertain, registerDraftGuard]);
  const cancel = () => busy || uncertain ? undefined : dirty ? confirm({ title: "Discard index metadata draft?", description: "The published article and public listings remain unchanged.", confirmLabel: "Discard draft", destructive: true, onConfirm: close }) : close();
  async function publish(kind: "name" | "visibility") {
    if (lock.current) return;
    const article = kind === "name" ? { ...source.article, title: name, identification: { ...source.article.identification, common_name: name } } : { ...source.article, priority };
    const body = { action: canApprove ? "publish" : "submit", slug, baseHash: source.baseHash, article, summary: kind === "name" ? `Update index display name for ${slug}` : `Change listing priority for ${slug}` };
    const identity = JSON.stringify(body);
    if (uncertain && pending.current?.identity !== identity) { setNotice("Retry the unconfirmed publication before changing another field."); return; }
    if (pending.current?.identity !== identity) pending.current = { identity, changeId: crypto.randomUUID(), kind };
    lock.current = true; setBusy(true); setUncertain(true); setNotice(""); setProposalId(null);
    try {
      const response = await fetch("/api/dev/article-lifecycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, changeId: pending.current.changeId }) });
      const data = await response.json();
      if (!response.ok) { if (response.status >= 400 && response.status < 500) setUncertain(false); throw new Error(data.error ?? "Publication failed. Your draft is preserved."); }
      if (!canApprove) {
        if (typeof data.proposalId !== "string" || !data.proposalId || data.changeId !== pending.current.changeId) throw new Error("No proposal receipt was received. Retry the same submission before closing.");
        setUncertain(false); setProposalId(data.proposalId);
        return;
      }
      if (!data.article || typeof data.baseHash !== "string") throw new Error("No publication receipt was received. Retry the same publication before closing.");
      setUncertain(false);
      setSource({ ...source, article: data.article, baseHash: data.baseHash }); pending.current = null;
      setNotice(kind === "name" ? "Published display name. The canonical URL, Reviewed status, and Review Flags are unchanged." : "Published listing priority. Direct article links remain available; Reviewed status and Review Flags are unchanged."); router.refresh();
    } catch (failure) { setNotice(failure instanceof Error ? failure.message : "No publication confirmation received. Your draft is preserved; retry to reconcile."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <ContextualEditorPanel title={`Edit ${currentName} display metadata`} description={`Canonical article ${source.article.id ?? slug}; /${slug}. The open editor keeps this identity when the index is filtered or sorted.`} open returnFocusRef={returnFocusRef} onOpenChange={cancel}>
    <div className="space-y-6">
      {source.draft ? <p role="alert">A private article draft already exists. Publish index changes only after reconciling that draft in the article editor; its content is not loaded or overwritten here.</p> : null}
      <EditorField label="Display Name / Title" htmlFor="index-item-name"><ArticleDisplayNameInput id="index-item-name" value={name} disabled={busy || uncertain} onChange={(event) => setName(event.target.value)} /></EditorField>
      <section aria-label="Local name preview"><h3>Local preview</h3><p>{name}</p><p className="theme-text-faint text-sm">Canonical URL unchanged: /{slug}</p></section>
      <DiffPreview diffText={buildTextChangelog("Display name", currentName, name).markdown} />
      <Button disabled={!nameDirty || !name.trim() || busy || !!source.draft || (uncertain && pending.current?.kind !== "name")} onClick={() => canApprove ? confirm({ title: "Publish display name?", description: "Changes the article title, index rows, search results, and metadata on both publications. Visibility, Reviewed status, and Review Flags do not change.", confirmLabel: "Publish display name", onConfirm: () => publish("name") }) : void publish("name")}>{canApprove ? "Publish display name" : "Submit display name for review"}</Button>
      <EditorField label="Priority and listing visibility" htmlFor="index-item-priority"><ArticlePrioritySelect id="index-item-priority" value={priority} disabled={busy || uncertain} onChange={setPriority} /></EditorField>
      <DiffPreview diffText={buildTextChangelog("Listing priority", source.article.priority ?? "normal", priority).markdown} />
      <p className="theme-text-faint text-sm">Low and Hide for now remove public listing projections but retain direct article links. High and Normal do not override a separate Hidden index category.</p>
      <Button variant="secondary" disabled={!visibilityDirty || busy || !!source.draft || (uncertain && pending.current?.kind !== "visibility")} onClick={() => confirm({ title: canApprove ? "Publish listing visibility separately?" : "Submit listing visibility separately?", description: `${canApprove ? "Set" : "Propose setting"} ${slug} to ${priority}. Affects the substance index, homepage, category listings, and search projections on both publications${canApprove ? "" : " only after admin approval"}. Direct article links remain; separate Hidden category, Reviewed status, and Review Flags are unchanged. The display-name draft is not included.`, confirmLabel: canApprove ? "Publish listing visibility" : "Submit visibility for review", onConfirm: () => publish("visibility") })}>{canApprove ? "Publish listing visibility" : "Submit visibility for review"}</Button>
      {notice && <p role="status">{notice}</p>}<Button variant="ghost" disabled={busy} onClick={cancel}>Cancel</Button>
      {proposalId && <EditorNotice notice={proposalSubmittedNotice(`Index metadata for ${slug}`, proposalId)} />}
      {uncertain && <p role="alert">The publication outcome is unconfirmed. Retry the same publication before closing.</p>}
    </div>{dialog}
  </ContextualEditorPanel>;
}
