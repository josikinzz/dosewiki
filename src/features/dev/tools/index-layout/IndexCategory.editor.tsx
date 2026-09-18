"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCopyIndexSource } from "../useCopyIndexSource";
import { Button } from "@/components/ui";
import type { DosageCategoryGroup } from "@/data/builders/library";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { EditorNotice, useConfirm } from "@/features/dev/components";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { buildTextChangelog } from "@/utils/data/changelog";
import type { BoardActions } from "./IndexLayoutCardMenus";
import { IndexLayoutBoard } from "./IndexLayoutBoard";
import { buildBoard, listDestinations, type BoardRecord } from "./boardModel";
import * as ops from "./layoutOps";
import { useCopyIndexOperation } from "../useCopyIndexOperation";
import { proposalSubmittedNotice, submitToolProposal } from "../proposalSubmission";
import { canDraft } from "@/lib/auth/roles";

const OPEN_LAYOUT_EVENT = "dosewiki:edit-index-category";
export default function IndexCategory({ group, groups }: { group?: DosageCategoryGroup; groups?: DosageCategoryGroup[] }) {
  const { enabled, mode, role } = useContextualEditing();
  const pathname = usePathname();
  const [selected, setSelected] = useState<DosageCategoryGroup | null>(null);
  const type = pathname?.startsWith("/substances") ? "psychoactive" : null;
  const allowed = enabled && mode === "edit" && canDraft(role) && !!type;
  useEffect(() => {
    if (group || !groups || !allowed) return;
    const open = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (typeof key !== "string") return;
      const match = groups.find((entry) => entry.key === key) ?? groups.filter((entry) => key.startsWith(`${entry.key}-`)).sort((a, b) => b.key.length - a.key.length)[0];
      if (match) setSelected((current) => current ?? match);
    };
    window.addEventListener(OPEN_LAYOUT_EVENT, open);
    return () => window.removeEventListener(OPEN_LAYOUT_EVENT, open);
  }, [allowed, group, groups]);
  if (!allowed || !type) return null;
  if (group) return <Button size="sm" variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_LAYOUT_EVENT, { detail: group.key }))} aria-label={`Edit ${group.name} index layout`}>Edit layout</Button>;
  return selected ? <LayoutSession key={selected.key} type={type} group={selected} close={() => setSelected(null)} /> : null;
}
function LayoutSession({ type, group, close }: { type: "psychoactive" | "chemical" | "mechanism"; group: DosageCategoryGroup; close: () => void }) {
  const result = useCopyIndexSource<ManualIndexConfig | null>(`/api/dev/index-layout?type=${type}`);
  const source = result.data;
  return source === undefined ? <ContextualEditorPanel title="Loading index layout" open onOpenChange={close}>{result.error ? <><p role="alert">{result.error}</p><Button onClick={result.reload}>Retry loading</Button></> : <p role="status">Loading the selected layout…</p>}</ContextualEditorPanel> : source ? <LayoutBody type={type} initial={source} group={group} close={close} /> : <ContextualEditorPanel title="Index layout unavailable" open onOpenChange={close}><p>This index has no stored manual layout.</p></ContextualEditorPanel>;
}
function LayoutBody({ type, initial, group, close }: { type: "psychoactive" | "chemical" | "mechanism"; initial: ManualIndexConfig; group: DosageCategoryGroup; close: () => void }) {
  const [baseline, setBaseline] = useState<ManualIndexConfig>({ version: initial.version, categories: initial.categories });
  const [revision, setRevision] = useState(initial.revision ?? 0);
  const { serialize: publicationBody, acknowledge, uncertain } = useCopyIndexOperation();
  const [draft, setDraft] = useState(baseline);
  const [notice, setNotice] = useState("");
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { role, setDirty, registerDraftGuard } = useContextualEditing();
  const canApprove = role === "admin";
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const key = `index:${type}:${group.key}`;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => { setDirty(key, dirty); return () => setDirty(key, false); }, [key, dirty, setDirty]);
  useEffect(() => registerDraftGuard(key, { discard: close, canDiscard: !busy && !uncertain }), [close, key, busy, uncertain, registerDraftGuard]);
  const records = useMemo(() => new Map<string, BoardRecord>([...group.drugs, ...(group.sections ?? []).flatMap((section) => section.drugs)].map((drug) => [drug.slug, { name: drug.name, isHidden: false, isDirectUrlOnly: false }])), [group]);
  const board = useMemo(() => buildBoard(draft, records), [draft, records]);
  const category = board.find((entry) => entry.key === group.key);
  const placed = useMemo(() => ops.collectPlacedSlugs(draft), [draft]);
  const cancel = () => busy || uncertain ? undefined : dirty ? confirm({ title: "Discard layout draft?", description: "Published indices remain unchanged.", confirmLabel: "Discard draft", destructive: true, onConfirm: close }) : close();
  const actions: BoardActions = {
    destinations: listDestinations(board.filter((entry) => entry.key === group.key)), addOptions: [...records].filter(([slug]) => !placed.has(slug)).map(([value, record]) => ({ value, label: record.name })),
    onBump: (slot, slug, direction) => setDraft((current) => ops.bumpSlug(current, slot, slug, direction)),
    onMove: (from, slug, to) => setDraft((current) => ops.moveSlug(current, from, slug, to)),
    onRemoveSlug: (slot, slug) => setDraft((current) => ops.removeSlug(current, slot, slug)),
    onAddSlug: (slot, slug) => setDraft((current) => ops.addSlug(current, slot, slug)),
    onPlaceSection: (categoryKey, sectionKey, target, placement) => setDraft((current) => ops.placeSection(current, categoryKey, sectionKey, target, placement)),
    onRenameSection: (categoryKey, sectionKey, label) => setDraft((current) => ops.renameSection(current, categoryKey, sectionKey, label)),
    onAddSection: (categoryKey, label) => setDraft((current) => ops.addSection(current, categoryKey, label).manual),
    onRemoveSection: (categoryKey, sectionKey) => confirm({ title: "Remove this grouping?", description: "Its items move to the category's ungrouped list in your draft. Nothing is published yet.", confirmLabel: "Remove grouping", onConfirm: () => setDraft((current) => ops.removeSection(current, categoryKey, sectionKey, true)) }),
    onUpdateCategory: (categoryKey, patch) => setDraft((current) => ops.updateCategoryIdentity(current, categoryKey, patch)),
    onRemoveCategory: (categoryKey) => confirm({ title: "Remove category from this index?", description: "Only this layout changes; article visibility and editorial review stay unchanged. Publication requires a second confirmation.", confirmLabel: "Remove from draft", onConfirm: () => setDraft((current) => ops.removeCategory(current, categoryKey)) }),
  };
  async function publish() {
    setBusy(true); setNotice(""); setProposalId(null);
    try {
      if (!canApprove) {
        const result = await submitToolProposal({ payload: { indexLayouts: [{ type, ...draft }] }, summary: `Update ${type} index layout`, baselines: [{ kind: "indexLayout", key: type, document: baseline }] });
        setProposalId(result.proposalId);
        return;
      }
      const response = await fetch("/api/dev/index-layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: publicationBody({ layout: { type, ...draft }, expected: baseline, expectedRevision: revision }) });
      const data = await response.json();
      const receipt = acknowledge(response, data);
      setRevision(receipt.revision); setBaseline(draft); setNotice(receipt.unchanged ? "No publication was needed; this layout is unchanged." : receipt.replayed ? "Your earlier publication receipt is confirmed. Later public edits may exist." : "Published index layout. Public indices and category projections are refreshing; article visibility, Reviewed status, and Review Flags are unchanged."); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Publication failed. Your draft is preserved."); } finally { setBusy(false); }
  }
  return <ContextualEditorPanel title={`Edit ${group.name} index`} description={`${type} layout. Category and section keys and substance slugs identify every edit, regardless of filtering. Layout membership is not article visibility.`} open onOpenChange={cancel}>
    <div className="space-y-6"><p className="theme-text-faint text-sm">Local preview. Entries not present in the loaded public category are shown by slug; their visibility is not changed.</p>
      <fieldset disabled={busy || uncertain}>
      {category ? <IndexLayoutBoard panels={[{ key: category.key, category, sections: category.sections, title: category.label, chrome: "category", hideIcon: false }]} sections={category.sections} actions={actions} onDrop={(from, slug, to, index) => { if (!busy && !uncertain) setDraft((current) => ops.moveSlug(current, from, slug, to, index)); }} resolveName={(slug) => records.get(slug)?.name ?? slug} emptyMessage="No groups in this draft." /> : <p>This category is absent from the draft.</p>}
      </fieldset>
      <DiffPreview diffText={buildTextChangelog(`${type} index`, JSON.stringify(baseline, null, 2), JSON.stringify(draft, null, 2)).markdown} />
      {notice && <p role="status">{notice}</p>}
      {proposalId && <EditorNotice notice={proposalSubmittedNotice(`${type} index layout`, proposalId)} />}
      {uncertain && <p role="alert">The publication outcome is not confirmed. Retry the same publication before closing or changing this draft.</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={!dirty || busy} onClick={() => canApprove ? confirm({ title: "Publish index layout?", description: "Publish the displayed diff to the substance index, grouped index pages, category projections, and both publications that consume this layout. Article direct links, visibility, Reviewed status, and Review Flags are unchanged.", confirmLabel: "Publish layout", onConfirm: publish }) : void publish()}>{busy ? (canApprove ? "Publishing…" : "Submitting…") : canApprove ? "Publish layout" : "Submit for review"}</Button><Button variant="secondary" disabled={busy} onClick={cancel}>Cancel</Button></div>
    </div>{dialog}
  </ContextualEditorPanel>;
}
