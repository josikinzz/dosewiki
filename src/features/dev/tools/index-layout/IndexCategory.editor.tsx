"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCopyIndexSource } from "../useCopyIndexSource";
import { Button } from "@/components/ui";
import type { DosageCategoryGroup } from "@/data/builders/library";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { Notice, useConfirm } from "@/features/dev/components";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { buildTextChangelog } from "@/utils/data/changelog";
import type { BoardActions } from "./IndexLayoutCardMenus";
import { IndexLayoutBoard } from "./IndexLayoutBoard";
import { buildBoard, listDestinations, type BoardRecord } from "./boardModel";
import { LayoutMoveDialog, type LayoutMoveRequest } from "./LayoutMoveDialog";
import { normalizeManual, slotName } from "./layoutModel";
import * as ops from "./layoutOps";
import { CopyIndexRefusal, useCopyIndexOperation } from "../useCopyIndexOperation";
import { proposalSubmittedNotice, submitToolProposal } from "../proposalSubmission";
import { canDraft } from "@/lib/auth/roles";

type LayoutType = "psychoactive" | "chemical" | "mechanism";

const OPEN_LAYOUT_EVENT = "dosewiki:edit-index-category";
const LAYOUT_NAMES: Record<LayoutType, string> = {
  psychoactive: "Psychoactive class",
  chemical: "Chemical class",
  mechanism: "Mechanism of action",
};

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

function LayoutSession({ type, group, close }: { type: LayoutType; group: DosageCategoryGroup; close: () => void }) {
  const result = useCopyIndexSource<ManualIndexConfig | null>(`/api/dev/index-layout?type=${type}`);
  const source = result.data;
  if (source === undefined) {
    return (
      <ContextualEditorPanel title={result.error ? "Could not load the index layout" : "Loading the index layout"} open onOpenChange={close}>
        {result.error ? (
          <div className="space-y-3">
            <p role="alert">{result.error}</p>
            <Button onClick={result.reload}>Try again</Button>
          </div>
        ) : (
          <p role="status">Loading the {LAYOUT_NAMES[type]} layout.</p>
        )}
      </ContextualEditorPanel>
    );
  }
  if (!source) {
    return (
      <ContextualEditorPanel title="Index layout unavailable" open onOpenChange={close}>
        <p>This index has no stored manual layout.</p>
      </ContextualEditorPanel>
    );
  }
  // Keyed on the revision: loading the latest version starts the draft again from it.
  return <LayoutBody key={source.revision ?? 0} type={type} initial={source} group={group} close={close} reloadLatest={result.reload} />;
}

type Outcome =
  | { kind: "published"; message: string }
  | { kind: "conflict" }
  | { kind: "frozen" }
  | { kind: "failed"; message: string };

function LayoutBody({
  type,
  initial,
  group,
  close,
  reloadLatest,
}: {
  type: LayoutType;
  initial: ManualIndexConfig;
  group: DosageCategoryGroup;
  close: () => void;
  reloadLatest: () => void;
}) {
  const [baseline, setBaseline] = useState<ManualIndexConfig>({ version: initial.version, categories: initial.categories });
  const [revision, setRevision] = useState(initial.revision ?? 0);
  const { serialize: publicationBody, acknowledge, uncertain } = useCopyIndexOperation();
  const [draft, setDraft] = useState(baseline);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveRequest, setMoveRequest] = useState<LayoutMoveRequest | null>(null);
  const { role, setDirty, registerDraftGuard } = useContextualEditing();
  const canApprove = role === "admin";
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const key = `index:${type}:${group.key}`;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const locked = busy || uncertain;
  useEffect(() => { setDirty(key, dirty); return () => setDirty(key, false); }, [key, dirty, setDirty]);
  useEffect(() => registerDraftGuard(key, { discard: close, canDiscard: !busy && !uncertain }), [close, key, busy, uncertain, registerDraftGuard]);
  const records = useMemo(() => new Map<string, BoardRecord>([...group.drugs, ...(group.sections ?? []).flatMap((section) => section.drugs)].map((drug) => [drug.slug, { name: drug.name, isHidden: false, isDirectUrlOnly: false }])), [group]);
  const board = useMemo(() => buildBoard(draft, records), [draft, records]);
  const category = board.find((entry) => entry.key === group.key);
  const placed = useMemo(() => ops.collectPlacedSlugs(normalizeManual(draft)), [draft]);
  const destinations = useMemo(() => listDestinations(board.filter((entry) => entry.key === group.key)), [board, group.key]);
  const change = (transform: (current: ManualIndexConfig) => ManualIndexConfig) => {
    if (locked) return;
    setDraft((current) => {
      const safe = normalizeManual(current);
      const next = transform(safe);
      return next === safe ? current : next;
    });
  };
  const cancel = () => locked ? undefined : dirty ? confirm({ title: "Discard the layout draft?", description: "The published index stays as it is.", confirmLabel: "Discard draft", destructive: true, onConfirm: close }) : close();
  const actions: BoardActions = {
    destinations,
    addOptions: [...records].filter(([slug]) => !placed.has(slug)).map(([value, record]) => ({ value, label: record.name })),
    listName: (slot) => slotName(board, slot),
    onBump: (slot, slug, direction) => change((current) => ops.bumpSlug(current, slot, slug, direction)),
    onPlace: (slot, slug, place) => change((current) => ops.moveSlug(current, slot, slug, slot, place === "top" ? 0 : Number.MAX_SAFE_INTEGER)),
    onRequestMove: (request) => { if (!locked) setMoveRequest(request); },
    onMove: (from, slug, to) => change((current) => ops.moveSlug(current, from, slug, to)),
    onRemoveSlug: (slot, slug) => change((current) => ops.removeSlug(current, slot, slug)),
    onAddSlug: (slot, slug) => change((current) => ops.addSlug(current, slot, slug)),
    onPlaceSection: (categoryKey, sectionKey, target, placement) => change((current) => ops.placeSection(current, categoryKey, sectionKey, target, placement)),
    onRenameSection: (categoryKey, sectionKey, label) => change((current) => ops.renameSection(current, categoryKey, sectionKey, label)),
    onAddSection: (categoryKey, label) => change((current) => ops.addSection(current, categoryKey, label).manual),
    onRemoveSection: (categoryKey, sectionKey) => confirm({ title: "Remove this section?", description: "Its substances move to the category's own list in your draft. Nothing is published yet.", confirmLabel: "Remove section", destructive: true, onConfirm: () => change((current) => ops.removeSection(current, categoryKey, sectionKey, true)) }),
    onUpdateCategory: (categoryKey, patch) => change((current) => ops.updateCategoryIdentity(current, categoryKey, patch)),
    onRemoveCategory: (categoryKey) => confirm({ title: "Remove this category from the index?", description: "Only this layout changes; article visibility and editorial review stay as they are. Publishing asks again.", confirmLabel: "Remove from draft", destructive: true, onConfirm: () => change((current) => ops.removeCategory(current, categoryKey)) }),
  };
  async function publish() {
    setBusy(true); setOutcome(null); setProposalId(null);
    try {
      if (!canApprove) {
        const result = await submitToolProposal({ payload: { indexLayouts: [{ type, ...draft }] }, summary: `Update ${type} index layout`, baselines: [{ kind: "indexLayout", key: type, document: baseline }] });
        setProposalId(result.proposalId);
        return;
      }
      const response = await fetch("/api/dev/index-layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: publicationBody({ layout: { type, ...draft }, expected: baseline, expectedRevision: revision }) });
      const data = await response.json();
      const receipt = acknowledge(response, data);
      setRevision(receipt.revision); setBaseline(draft);
      setOutcome({
        kind: "published",
        message: receipt.unchanged
          ? "Nothing needed publishing; this layout is unchanged."
          : receipt.replayed
            ? "Your earlier publication went through. Someone may have published changes since."
            : "Published the index layout. The public index and category lists are refreshing; article visibility, Reviewed status and Review flags are unchanged.",
      });
      router.refresh();
    } catch (error) {
      if (error instanceof CopyIndexRefusal && error.frozen) setOutcome({ kind: "frozen" });
      else if (error instanceof CopyIndexRefusal && error.conflict) setOutcome({ kind: "conflict" });
      else setOutcome({ kind: "failed", message: error instanceof Error ? error.message : "Publication failed. Your draft is kept." });
    } finally { setBusy(false); }
  }
  const loadLatest = () => confirm({
    title: "Load the latest version?",
    description: "Your draft of this layout is dropped and the published layout loads in its place.",
    confirmLabel: "Drop my draft and load",
    destructive: true,
    onConfirm: reloadLatest,
  });
  const publishLabel = busy ? (canApprove ? "Publishing" : "Submitting") : canApprove ? "Publish layout" : "Submit for review";
  return <ContextualEditorPanel title={`Edit the ${group.name} index`} description={`${LAYOUT_NAMES[type]} layout. Category and section keys and substance slugs identify every edit, whatever the page filters. Being in the layout does not change an article's visibility.`} open onOpenChange={cancel}>
    <div className="space-y-6">
      <p className="theme-text-faint text-sm">A local preview. Entries the loaded category does not carry show by slug; their visibility does not change.</p>
      <fieldset disabled={locked}>
        <legend className="sr-only">{`${group.name} layout`}</legend>
        {category ? <IndexLayoutBoard panels={[{ key: category.key, category, sections: category.sections, title: category.label, chrome: "category", hideIcon: false }]} sections={category.sections} actions={actions} onDrop={(from, slug, to, index) => change((current) => ops.moveSlug(current, from, slug, to, index))} resolveName={(slug) => records.get(slug)?.name ?? slug} emptyMessage={<p className="theme-text-muted text-center text-sm">No sections in this draft.</p>} /> : <p>This category is not in the draft.</p>}
      </fieldset>
      <DiffPreview diffText={buildTextChangelog(`${type} index`, JSON.stringify(baseline, null, 2), JSON.stringify(draft, null, 2)).markdown} />
      <div className="space-y-3">
        {outcome?.kind === "published" ? <Notice placement="inline" tone="success" dismiss={() => setOutcome(null)}>{outcome.message}</Notice> : null}
        {outcome?.kind === "frozen" ? <Notice placement="inline" tone="warning" dismiss={() => setOutcome(null)}>Writes are paused, so your changes were not published. Your draft is kept.</Notice> : null}
        {outcome?.kind === "conflict" ? (
          <Notice
            placement="inline"
            tone="warning"
            actions={<Button type="button" variant="outline" size="xs" onClick={loadLatest}>Load the latest version</Button>}
          >
            Someone published this layout after you opened it, so nothing was published. Your draft is still here.
          </Notice>
        ) : null}
        {outcome?.kind === "failed" ? <Notice placement="inline" tone="danger" dismiss={() => setOutcome(null)}>{outcome.message}</Notice> : null}
        {proposalId && <Notice {...proposalSubmittedNotice(`${type} index layout`, proposalId)} />}
        {uncertain && <p role="alert">The publication has no confirmed outcome. Publish the same draft again before closing or changing it.</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || busy} onClick={() => canApprove ? confirm({ title: "Publish the index layout?", description: "Publishes the diff above to the substance index, grouped index pages, category lists, and both publications that read this layout. Article links, visibility, Reviewed status and Review flags are unchanged.", confirmLabel: "Publish layout", onConfirm: publish }) : void publish()}>{publishLabel}</Button>
          <Button variant="secondary" disabled={busy} onClick={cancel}>Cancel</Button>
        </div>
      </div>
    </div>
    <LayoutMoveDialog
      request={moveRequest}
      destinations={destinations}
      holds={(slot, slug) => board.flatMap((entry) => entry.sections).find((section) => ops.slotsEqual(section.slot, slot))?.items.some((item) => item.slug === slug) ?? false}
      onClose={() => setMoveRequest(null)}
      onMove={(request, to) => { setMoveRequest(null); actions.onMove(request.from, request.slug, to); }}
    />
    {dialog}
  </ContextualEditorPanel>;
}
