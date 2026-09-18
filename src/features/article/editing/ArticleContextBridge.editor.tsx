"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { Icon } from "@/components/common/Icon";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { useContextualEditing, type DraftNavigationGuard } from "@/features/contextual-editing/context";
import { EditorToolbar } from "@/features/dev/components/EditorToolbar";
import { canDraft, type AppRole } from "@/lib/auth/roles";
import { ArticleLayout, type ArticleLayoutProps } from "../components/ArticleLayout";
import { ArticleEditProvider, type ArticleEditContextValue } from "./ArticleEditContext";
import { ArticleSectionEditorContext } from "./ArticleSectionEditor.editor";
import { ARTICLE_SECTION_LABELS, ArticleSectionForm, type ArticleEditorSection, type SectionFormHandle } from "./ArticleSectionForm";
import { ArticleChangeDiff, articleFieldChanges } from "./ArticleChangeDiff";
import { synthesizeChangeNote } from "./changeNote";
import { ArticleProposalReview } from "./ArticleProposalReview";
import { useArticleLifecycle, articlePublicationErrors, type ArticleRevision } from "./useArticleLifecycle";
import type { SubstanceArticle } from "@/schema";
import { useArticleForm } from "@/hooks/useArticleForm";

export type ArticleContextBridgeProps = {
  slug?: string; article: SubstanceArticle; children: ReactNode;
  layoutProps?: Omit<ArticleLayoutProps, "article" | "contributorDirectory">;
  workbench?: boolean;
  workbenchRole?: AppRole | null;
  workbenchEmail?: string | null;
  requestedSection?: ArticleEditorSection | null;
  onSectionClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  draftGuardRef?: React.MutableRefObject<DraftNavigationGuard | null>;
  onOperationLockChange?: (locked: boolean) => void;
};

export default function ArticleContextBridge(props: ArticleContextBridgeProps) {
  const context = useContextualEditing();
  const email = props.workbenchEmail === undefined ? context.email : props.workbenchEmail;
  const owner = useRef(email);
  // Retain unsaved work while signed out, but never carry it into another account.
  if (email) owner.current = email;
  return <ArticleEditingSession key={`${props.slug ?? ""}:${owner.current ?? ""}`} {...props} />;
}

function StickyArticleEditorLayout({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    const bar = barRef.current;
    if (!scope || !bar) return;
    const header = document.querySelector<HTMLElement>(".app-header");
    const strip = scope.querySelector<HTMLElement>(".theme-toc-strip-shell");
    const inReviewWorkbench = !!scope.closest(".theme-review-article-scope");
    const publish = () => {
      scope.style.setProperty("--article-editor-top", header
        ? `${header.getBoundingClientRect().height}px`
        : inReviewWorkbench ? "var(--review-bar-height, 3.25rem)" : "0px");
      scope.style.setProperty("--article-editor-bar-height", `${bar.getBoundingClientRect().height}px`);
      scope.style.setProperty("--article-editor-toc-height", `${strip?.getBoundingClientRect().height ?? 0}px`);
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    for (const element of [header, bar, strip]) {
      if (element) observer?.observe(element);
    }
    window.addEventListener("resize", publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, []);

  return <div ref={scopeRef} className="theme-article-editor-scope min-w-0">
    <div ref={barRef} className="theme-article-editor-bar theme-chrome-dark sticky z-40 mx-[calc(50%-50vw)]">
      <div className="mx-auto max-w-[1500px] px-[max(1rem,env(safe-area-inset-left))] py-1 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
        {actions}
      </div>
    </div>
    {children}
  </div>;
}

function ArticleEditingSession({ slug, article, children, layoutProps, workbench = false, workbenchRole, requestedSection, onSectionClose, onDirtyChange, draftGuardRef, onOperationLockChange }: ArticleContextBridgeProps) {
  const context = useContextualEditing();
  const router = useRouter();
  const summaryId = useId();
  const role = workbench ? workbenchRole ?? null : context.role;
  const active = !!slug && canDraft(role) && (workbench || (context.enabled && context.mode === "edit"));
  const lifecycle = useArticleLifecycle(slug ?? "", article, active);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalNotesDirty, setProposalNotesDirty] = useState(false);
  const resetProposalNotes = useRef<() => void>(() => {});
  const requestLocked = lifecycle.busy || lifecycle.uncertain || proposalBusy;
  const operationLocked = requestLocked || !!lifecycle.recovery || lifecycle.baselineRefreshRequired;
  const [section, setSection] = useState<ArticleEditorSection | null>(null);
  const [review, setReview] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const historyId = useId();
  const [formDirty, setFormDirty] = useState(false);
  const [inlineDirty, setInlineDirty] = useState(false);
  const inlineDrafts = useRef(new Map<string, { save: () => Promise<void>; discard: () => void }>());
  const registerDraft: NonNullable<ArticleEditContextValue["registerDraft"]> = useCallback((path, draft) => {
    inlineDrafts.current.set(path, draft); setInlineDirty(true);
    return () => { inlineDrafts.current.delete(path); setInlineDirty(inlineDrafts.current.size > 0); };
  }, []);
  const [formEpoch, setFormEpoch] = useState(0);
  const form = useArticleForm({ article: lifecycle.article, preserveStructure: section !== "dosage", onMutate: () => setFormDirty(true) });
  const resetEpoch = useRef(formEpoch);
  useEffect(() => {
    if (resetEpoch.current === formEpoch) return;
    resetEpoch.current = formEpoch;
    form.resetForm(lifecycle.article);
  }, [formEpoch, form.resetForm, lifecycle.article]);
  const [summary, setSummary] = useState("");
  // Blank is not agreement, and neither is an untouched prefill: this records
  // whether the note on screen is the editor's sentence or the one the diff
  // wrote, so the prefill keeps tracking the changes until a person types.
  const [summaryEdited, setSummaryEdited] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [restore, setRestore] = useState<ArticleRevision | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  useEffect(() => { if (requestedSection && active) setSection(requestedSection); }, [requestedSection, active]);
  useEffect(() => { onDirtyChange?.(lifecycle.dirty || formDirty || inlineDirty || proposalNotesDirty || operationLocked); return () => onDirtyChange?.(false); }, [onDirtyChange, lifecycle.dirty, formDirty, inlineDirty, proposalNotesDirty, operationLocked]);
  useEffect(() => { onOperationLockChange?.(operationLocked); }, [onOperationLockChange, operationLocked]);
  const formRef = useRef<SectionFormHandle | null>(null);
  const guardRef = useRef<DraftNavigationGuard>({ discard: () => {} });
  const guardKey = `article:${slug}`;
  const collect = async () => {
    for (const draft of inlineDrafts.current.values()) await draft.save();
    return formDirty && formRef.current ? formRef.current.collect() : lifecycle.getArticle();
  };
  const saveDraft = async () => {
    if (operationLocked) throw new Error("Reconcile the previous operation before saving a private draft.");
    if (proposalNotesDirty) throw new Error("Post or discard the proposal notes before saving an article draft.");
    const candidate = await collect();
    await lifecycle.act("saveDraft", summary, undefined, candidate);
    setFormDirty(false); setFormEpoch((value) => value + 1);
  };
  const discardLocal = () => {
    if (operationLocked) return;
    resetProposalNotes.current();
    for (const draft of inlineDrafts.current.values()) draft.discard();
    inlineDrafts.current.clear(); setInlineDirty(false);
    lifecycle.discardLocal(); setFormDirty(false); setFormEpoch((value) => value + 1);
  };
  guardRef.current = { ...(operationLocked || proposalNotesDirty ? {} : { save: saveDraft }), discard: discardLocal, canDiscard: !operationLocked };
  if (draftGuardRef) draftGuardRef.current = guardRef.current;
  useEffect(() => {
    context.setDirty(guardKey, lifecycle.dirty || formDirty || inlineDirty || proposalNotesDirty || operationLocked);
    return () => context.setDirty(guardKey, false);
  }, [context.setDirty, guardKey, lifecycle.dirty, formDirty, inlineDirty, proposalNotesDirty, operationLocked]);
  useEffect(() => context.registerDraftGuard(guardKey, {
    ...(operationLocked || proposalNotesDirty ? {} : { save: async () => { await guardRef.current.save?.(); } }),
    discard: () => guardRef.current.discard(), canDiscard: !operationLocked,
  }), [context.registerDraftGuard, guardKey, operationLocked, proposalNotesDirty]);
  const attempt = async (operation: () => Promise<void>) => {
    setLocalError(null);
    try { await operation(); } catch (failure) { setLocalError(failure instanceof Error ? failure.message : "The operation was not confirmed. Your edits are retained."); }
  };
  const closePanel = () => { setSection(null); setReview(false); onSectionClose?.(); };
  const preview = async () => {
    lifecycle.preview(await collect()); setFormDirty(false); setFormEpoch((value) => value + 1); closePanel();
  };
  const prepareReview = async () => {
    lifecycle.preview(await collect()); setFormDirty(false); setSection(null); setReview(true);
  };
  const openSection = (next: ArticleEditorSection) => {
    void attempt(async () => { lifecycle.preview(await collect()); setFormDirty(false); setFormEpoch((value) => value + 1); setSection(next); setReview(false); setLocalError(null); });
  };
  const refreshBaseline = async () => {
    if (requestLocked || proposalNotesDirty) throw new Error("Finish the pending operation or proposal notes before refreshing the article baseline.");
    lifecycle.preview(await collect());
    setFormDirty(false); setFormEpoch((value) => value + 1); closePanel();
    await lifecycle.refresh();
  };
  const refreshControl = lifecycle.loaded ? <Button variant="outline" size="sm" disabled={requestLocked || !!lifecycle.recovery || proposalNotesDirty} onClick={() => { void attempt(refreshBaseline); }}>Refresh latest baseline</Button> : null;
  const changes = useMemo(() => active ? articleFieldChanges(lifecycle.published, lifecycle.article) : [], [active, lifecycle.published, lifecycle.article]);
  const problems = useMemo(() => active ? articlePublicationErrors(lifecycle.article, lifecycle.published) : [], [active, lifecycle.article, lifecycle.published]);
  // The note arrives written. It keeps following the changed fields while the
  // editor has not touched it, because collecting an open field or a section
  // form can add a change after the panel opens.
  useEffect(() => {
    if (!review || summaryEdited) return;
    setSummary(synthesizeChangeNote(changes));
  }, [review, summaryEdited, changes]);
  // Publishing is one named action, not a pair of icons. An editor without
  // publication rights submits the same change for review through it.
  const canPublish = role === "admin" && !lifecycle.revisionOf;
  const primaryLabel = canPublish ? "Publish" : lifecycle.revisionOf ? "Submit proposal revision" : "Submit for review";
  const countLabel = changes.length === 1 ? "1 change" : `${changes.length} changes`;
  const actionBlocked = operationLocked || changes.length === 0 || problems.length > 0;
  const runPrimary = () => {
    if (actionBlocked) return;
    void attempt(async () => {
      await lifecycle.act(canPublish ? "publish" : "submit", summary);
      // The write answered with the published article and the lifecycle has
      // already adopted it. Refreshing the route here would re-run the page
      // and re-drain the editor library, which reads as a reload of work the
      // editor just watched land.
      setSummary(""); setSummaryEdited(false); setReview(false);
    });
  };
  const retryControl = lifecycle.uncertain ? <Button variant="outline" disabled={lifecycle.busy} onClick={() => {
    void attempt(async () => { await lifecycle.retry(); setFormDirty(false); setFormEpoch((value) => value + 1); setRestore(null); setDiscardOpen(false); closePanel(); router.refresh(); });
  }}>Retry previous operation</Button> : null;
  const status = lifecycle.uncertain ? "Previous operation unconfirmed. Editing is paused until it is reconciled." : !lifecycle.loaded ? (lifecycle.error ? "Article editing state could not be loaded." : "Loading article and private draft…") : lifecycle.busy ? "Loading or saving…" : lifecycle.notice ?? (lifecycle.dirty || formDirty || inlineDirty ? "Unsaved local edits" : lifecycle.hasDraft ? "Private draft loaded" : "Published article loaded");
  if (!active) return <>{children}</>;
  if (lifecycle.expired) return <>
    <Surface variant="subtle" padding="md" className="mx-auto mb-6 max-w-5xl space-y-3">
      <p role="alert" className="theme-text-primary">Article access has expired or changed. Your private draft is concealed and retained in this tab. Nothing will save or publish automatically.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><a href={`/sign-in?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`} target="_blank" rel="noopener noreferrer">Sign in in a new tab</a></Button>
        <Button variant="outline" disabled={requestLocked} onClick={() => { void attempt(refreshBaseline); }}>Refresh latest baseline</Button>
      </div>
      {lifecycle.error && <p role="alert" className="theme-text-muted text-sm">{lifecycle.error}</p>}
    </Surface>
    {children}
  </>;
  return <ArticleSectionEditorContext.Provider value={lifecycle.ready && !operationLocked ? openSection : null}>
    <StickyArticleEditorLayout actions={<>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-full sm:flex sm:basis-auto sm:items-center sm:gap-3">
          <p className="theme-text-primary shrink-0 text-sm font-semibold">Private preview</p>
          <p className="theme-text-muted truncate text-xs" role="status" title={status}>{status}</p>
        </div>
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-1">
          {lifecycle.ready ? <>
            <Button variant="outline" size="icon" aria-label="Save draft" title="Save draft" disabled={operationLocked} onClick={() => { void attempt(saveDraft); }}><Icon icon="lucide:save" size={16} /></Button>
            {changes.length > 0 && <Button className="h-auto min-h-9 max-w-full whitespace-normal px-3 text-sm" title={`${primaryLabel} (${countLabel})`} disabled={operationLocked} onClick={() => { void attempt(prepareReview); }}><span className="sm:hidden">Review ({changes.length})</span><span className="hidden sm:inline">{primaryLabel} ({countLabel})</span></Button>}
            <Button variant="ghost" size="icon" aria-label="Review changes and history" title="Review changes and history" disabled={operationLocked} onClick={() => { void attempt(prepareReview); }}><Icon icon="lucide:history" size={16} /></Button>
          </> : !lifecycle.loaded && <Button variant="outline" size="icon" aria-label="Load private draft" title="Load private draft" disabled={requestLocked} onClick={() => { void lifecycle.load(); }}><Icon icon="lucide:download" size={16} /></Button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Private preview options" title="Private preview options"><Icon icon="lucide:ellipsis" size={16} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={16} className="w-72 max-w-[calc(100vw-2rem)]">
              <p className="theme-text-primary px-2 py-2 text-sm">{status}</p>
              <p className="theme-text-muted px-2 pb-2 text-sm">Nothing publishes automatically. Save a private draft, or review the changed fields before submitting or publishing.</p>
              {lifecycle.loaded && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-11" disabled={requestLocked || !!lifecycle.recovery || proposalNotesDirty} onSelect={() => { void attempt(refreshBaseline); }}><Icon icon="lucide:refresh-cw" size={16} />Refresh latest baseline</DropdownMenuItem>
              </>}
              {lifecycle.ready && lifecycle.hasDraft && <DropdownMenuItem className="min-h-11" disabled={operationLocked} onSelect={() => setDiscardOpen(true)}><Icon icon="lucide:trash-2" size={16} />Discard saved draft</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!lifecycle.ready && lifecycle.loaded && <p role="alert" className="theme-text-primary px-1 py-2 text-sm">{lifecycle.baselineRefreshRequired ? "The saved draft was discarded. Refresh and reconcile the latest article before editing; your local copy remains here." : "Article writes are paused. Your edits remain here; no operation will resume automatically after sign-in."}</p>}
      {lifecycle.uncertain && <p className="theme-text-primary px-1 py-2 text-sm">{status}</p>}
      {retryControl && <div className="px-1 py-2">{retryControl}</div>}
      {(localError || lifecycle.error) && <p className="theme-text-primary whitespace-pre-wrap px-1 py-2 text-sm" role="alert">{localError || lifecycle.error}</p>}
    </>}>
    <ArticleEditProvider value={lifecycle.ready && !operationLocked ? { commit: lifecycle.commit, registerDraft, refreshStoredValue: lifecycle.refreshStoredValue, addReference: lifecycle.addReference, references: lifecycle.article.references ?? [] } : null}>
      <ArticleLayout {...layoutProps} content={layoutProps?.content ? { ...layoutProps.content, chemistryPresentation: buildArticleChemistryPresentation(lifecycle.article) } : undefined} fromSubstanceSlug={slug} article={lifecycle.article} />
    </ArticleEditProvider>
    </StickyArticleEditorLayout>
    <ContextualEditorPanel title={section ? `Edit ${ARTICLE_SECTION_LABELS[section].toLowerCase()}` : "Review article changes"} open={!!section || review} onOpenChange={(open) => {
      if (open) return;
      if (formDirty || lifecycle.dirty || inlineDirty || proposalNotesDirty || operationLocked) setLeaveOpen(true); else closePanel();
    }}>
      <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
        {section && <fieldset className="min-w-0" disabled={operationLocked} onInput={() => setFormDirty(true)}><ArticleSectionForm key={`${section}:${formEpoch}`} article={lifecycle.article} slug={slug} section={section} form={form} handleRef={formRef} /></fieldset>}
        {review && <>
          <section className="space-y-4">
          <h3 className="theme-text-primary font-semibold">Your changes</h3>
          {changes.length === 0 && <p className="theme-text-muted text-sm">No article fields changed.</p>}
          {changes.length > 0 && <>
          <label htmlFor={summaryId} className="theme-text-primary block space-y-2 text-sm">Change note<Input id={summaryId} value={summary} onChange={(event) => { setSummary(event.target.value); setSummaryEdited(true); }} onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            runPrimary();
          }} /></label>
          <p className="theme-text-muted text-sm">Written from the changed fields. Edit it if the change deserves more than the diff already says.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={actionBlocked} onClick={runPrimary}>{primaryLabel} ({countLabel})</Button>
            {canPublish && <Button variant="outline" disabled={actionBlocked} onClick={() => { void attempt(async () => { await lifecycle.act("submit", summary); setSummary(""); setSummaryEdited(false); setReview(false); }); }}>Submit for review instead</Button>}
          </div>
          <p className="theme-text-muted text-sm">Publishing changes the live article and its derived displays for all readers. Route and country identities are guarded against the loaded article revision. Classification changes affect this substance's index memberships; shared taxonomies and other articles remain unchanged.</p>
          </>}
          {problems.length > 0 && <div role="alert" className="theme-text-primary space-y-2 text-sm">{problems.map((problem, index) => {
            const key = problem.split(/[.:[ ]/, 1)[0] as ArticleEditorSection;
            return <div key={index} className="space-y-1"><p>{problem}</p>{key in ARTICLE_SECTION_LABELS && <Button variant="outline" size="sm" disabled={operationLocked} onClick={() => openSection(key)}>Edit {ARTICLE_SECTION_LABELS[key].toLowerCase()}</Button>}</div>;
          })}</div>}
          <ArticleChangeDiff before={lifecycle.published} after={lifecycle.article} />
          </section>
          <section className="space-y-4">
            <ExpandButton variant="inline" className="min-h-11 w-full justify-between gap-3 text-sm font-semibold before:inset-0" isExpanded={historyExpanded} onToggle={() => setHistoryExpanded((value) => !value)} label="Article history" ariaLabel="Article history" ariaControls={historyId} />
            <div id={historyId} hidden={!historyExpanded} className="space-y-5">
            {lifecycle.history.length === 0 && <p className="theme-text-muted text-sm">No canonical revisions recorded.</p>}
            {lifecycle.history.map((revision) => <div key={revision.revisionId} className="space-y-3 border-b border-dose-border pb-5 last:border-0 last:pb-0">
              <p className="theme-text-primary text-sm">{revision.actorEmail} · {new Date(revision.createdAt).toLocaleString()} · {revision.summary}</p>
              <ArticleChangeDiff before={revision.before} after={revision.after} />
              {role === "admin" && <Button variant="outline" size="sm" disabled={operationLocked || lifecycle.dirty || formDirty || proposalNotesDirty || revision.resultHash !== lifecycle.publishedHash} onClick={() => setRestore(revision)}>Review restore</Button>}
              {revision.resultHash !== lifecycle.publishedHash && <p className="theme-text-muted text-sm">Newer work prevents restoring this change directly.</p>}
            </div>)}
            </div>
          </section>
          <ArticleProposalReview
            proposals={lifecycle.proposals} slug={slug!} canApprove={role === "admin"}
            blocked={operationLocked || lifecycle.dirty || formDirty || inlineDirty}
            onBusyChange={setProposalBusy} onNotesDirty={setProposalNotesDirty} resetNotesRef={resetProposalNotes}
            onPublished={async () => { await lifecycle.load(); router.refresh(); }}
            onLoad={async (patch, revisionOf) => {
              if (lifecycle.hasDraft) throw new Error("Discard the saved private draft before loading a different proposal.");
              const fresh = await lifecycle.load();
              if (!fresh) throw new Error("Could not load the current published article.");
              if (fresh.draft) throw new Error("A private draft exists. Discard it explicitly before loading this proposal.");
              lifecycle.preview({ ...fresh.article, ...patch, id: fresh.article.id, editorial_review: fresh.article.editorial_review });
              lifecycle.setRevisionOf(revisionOf);
              setSummary(revisionOf ? `Revision of proposal ${revisionOf}` : "New submission following review feedback");
              setReview(false); setSection("summary");
            }}
          />
        </>}
        {section && <EditorToolbar variant="compact" label="Section editing actions" className="gap-1">
          <Button variant="outline" size="sm" className={`w-8 shrink-0 p-0 ${TOUCH_ICON}`} aria-label="Preview locally" title="Preview locally" disabled={operationLocked} onClick={() => { void attempt(preview); }}><Icon icon="lucide:eye" size={16} aria-hidden /></Button>
          <Button variant="outline" size="sm" className={`w-8 shrink-0 p-0 ${TOUCH_ICON}`} aria-label="Save draft" title="Save draft" disabled={operationLocked} onClick={() => { void attempt(saveDraft); }}><Icon icon="lucide:save" size={16} aria-hidden /></Button>
          <Button size="sm" disabled={operationLocked} onClick={() => { void attempt(prepareReview); }}>Review changes</Button>
          <Button variant="ghost" size="sm" aria-label="Cancel section edit" title="Cancel section edit" disabled={operationLocked} onClick={() => { setFormDirty(false); setFormEpoch((value) => value + 1); closePanel(); }}>Cancel</Button>
        </EditorToolbar>}
        {(localError || lifecycle.error) && <p role="alert" className="theme-text-primary whitespace-pre-wrap text-sm">{localError || lifecycle.error}</p>}
        {retryControl}
        {refreshControl}
      </div>
    </ContextualEditorPanel>
    <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}><DialogContent><DialogHeader><DialogTitle>Keep your article edits?</DialogTitle><DialogDescription>Save a private draft, discard unsaved local edits, or stay in the editor. No option publishes the article.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2"><Button disabled={operationLocked || proposalNotesDirty} onClick={() => { void attempt(async () => { await saveDraft(); setLeaveOpen(false); closePanel(); }); }}>Save draft</Button><Button variant="outline" disabled={operationLocked} onClick={() => { discardLocal(); setLeaveOpen(false); closePanel(); }}>Discard local edits</Button><Button variant="ghost" onClick={() => setLeaveOpen(false)}>Stay</Button></div>
      {proposalNotesDirty && <p className="theme-text-muted text-sm">Unposted discussion and rejection notes cannot be saved as an article draft. Stay to post them, or discard them.</p>}
      {localError && <p role="alert">{localError}</p>}
    </DialogContent></Dialog>
    <Dialog open={discardOpen} onOpenChange={setDiscardOpen}><DialogContent><DialogHeader><DialogTitle>Discard your private article draft?</DialogTitle><DialogDescription>This removes your saved draft and local edits, then loads the current published article. Published content remains unchanged.</DialogDescription></DialogHeader><Button disabled={operationLocked || proposalNotesDirty} onClick={() => { void attempt(async () => {
      await lifecycle.act("discardDraft");
      for (const draft of inlineDrafts.current.values()) draft.discard();
      inlineDrafts.current.clear(); setInlineDirty(false);
      setFormDirty(false); setFormEpoch((value) => value + 1); setDiscardOpen(false);
    }); }}>Discard private draft</Button>{localError && <p role="alert">{localError}</p>}</DialogContent></Dialog>
    <ContextualEditorPanel title="Reconcile article draft" open={!!lifecycle.recovery} onOpenChange={(open) => { if (!open && !requestLocked) lifecycle.cancelRecovery(); }} description="The latest public article and saved draft have been fetched. Your local draft is still unchanged. Nothing is saved or published by this review.">
      {lifecycle.recovery && <div className="space-y-5 overflow-y-auto">
        <p className="theme-text-muted text-sm">Before is the refreshed public article. After is your retained draft, including any older values. Keep your draft to reconcile these differences in the editor against the latest revision, or discard local edits and load the latest saved state.</p>
        <ArticleChangeDiff before={lifecycle.recovery.article} after={lifecycle.article} />
        {lifecycle.recovery.draft && <section className="space-y-3">
          <h3 className="theme-text-primary font-semibold">Latest saved private draft compared with your local draft</h3>
          <ArticleChangeDiff before={lifecycle.recovery.draft.article} after={lifecycle.article} />
        </section>}
        <div className="flex flex-wrap gap-2">
          <Button className="h-auto min-h-11 max-w-full whitespace-normal" disabled={requestLocked} onClick={() => { void attempt(async () => { lifecycle.reconcile(true); setReview(true); }); }}>Keep my draft on latest baseline</Button>
          <Button variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal" disabled={requestLocked} onClick={() => { void attempt(async () => { lifecycle.reconcile(false); setFormEpoch((value) => value + 1); }); }}>{lifecycle.recovery.draft ? "Discard local edits and load saved draft" : "Discard local edits and load published article"}</Button>
          <Button variant="ghost" disabled={requestLocked} onClick={() => lifecycle.cancelRecovery()}>Keep current baseline</Button>
        </div>
        {(localError || lifecycle.error) && <p role="alert" className="theme-text-primary whitespace-pre-wrap text-sm">{localError || lifecycle.error}</p>}
      </div>}
    </ContextualEditorPanel>
    <ContextualEditorPanel title="Confirm live article restore" open={!!restore} onOpenChange={(open) => { if (!open) setRestore(null); }} description="Restore creates a new attributed revision. It cannot overwrite a newer article revision.">
      {restore && <div className="space-y-5 overflow-y-auto"><ArticleChangeDiff before={lifecycle.published} after={restore.before} /><Button disabled={operationLocked || role !== "admin" || restore.resultHash !== lifecycle.publishedHash} onClick={() => { void attempt(async () => { await lifecycle.act("restore", `Undo ${restore.revisionId}`, restore.revisionId); router.refresh(); setRestore(null); }); }}>Restore the state before this change</Button>{localError && <p role="alert">{localError}</p>}</div>}
      {retryControl}
    </ContextualEditorPanel>
  </ArticleSectionEditorContext.Provider>;
}
