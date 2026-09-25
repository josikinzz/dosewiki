"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { Icon } from "@/components/common/Icon";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpandButton } from "@/components/common/ExpandButton";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { useContextualEditing, type DraftNavigationGuard } from "@/features/contextual-editing/context";
import { EditorToolbar } from "@/features/dev/components/EditorToolbar";
import { useConfirm } from "@/features/dev/components/ConfirmDialog";
import { PublicationReceiptChips, PublishSheet, type PublishAction } from "@/features/contextual-editing/PublishSheet";
import { usePublicationReceipt } from "@/features/contextual-editing/usePublicationReceipt";
import { useUnsavedEditsGuard } from "@/features/contextual-editing/useUnsavedEditsGuard";
import { publicationMessage } from "./publicationNotice";
import { canDraft, type AppRole } from "@/lib/auth/roles";
import { ArticleLayout, type ArticleLayoutProps } from "../components/ArticleLayout";
import { ArticleEditProvider, type ArticleEditContextValue } from "./ArticleEditContext";
import { ArticleSectionEditorContext } from "./ArticleSectionEditor.editor";
import { ARTICLE_SECTION_LABELS, ArticleSectionForm, type ArticleEditorSection, type SectionFormHandle } from "./ArticleSectionForm";
import { ArticleChangeDiff, articleFieldChanges } from "./ArticleChangeDiff";
import { synthesizeChangeNote } from "./changeNote";
import { ArticleProposalReview } from "./ArticleProposalReview";
import { useArticleLifecycle, articlePublicationErrors, describeValidationIssue, type ArticleRevision } from "./useArticleLifecycle";
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
  const [restore, setRestore] = useState<ArticleRevision | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
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
  // The same dialog the launcher shows before leaving the page. The launcher's
  // guard already holds the browser tab while this session is dirty.
  const leaveGuard = useUnsavedEditsGuard(formDirty || lifecycle.dirty || inlineDirty || proposalNotesDirty || operationLocked, {
    reason: proposalNotesDirty ? "Unposted discussion and rejection notes cannot be saved as an article draft." : undefined,
    onSave: operationLocked || proposalNotesDirty ? undefined : saveDraft,
    onDiscard: discardLocal,
    canDiscard: !operationLocked,
    warnOnUnload: false,
  });
  const localDirty = lifecycle.dirty || formDirty || inlineDirty;
  const requestDiscardLocal = () => confirm({
    title: "Discard your unsaved edits?",
    description: "This drops the edits not yet saved in your private draft. Your saved draft and the published article stay unchanged.",
    confirmLabel: "Discard",
    destructive: true,
    onConfirm: discardLocal,
  });
  const requestDiscardDraft = () => confirm({
    title: "Discard your private article draft?",
    description: proposalNotesDirty
      ? "Post or discard the unposted proposal notes before discarding the draft."
      : "This removes your saved draft and local edits, then loads the current published article. Published content remains unchanged.",
    ...(proposalNotesDirty ? {} : { confirmLabel: "Discard private draft", destructive: true }),
    onConfirm: () => attempt(async () => {
      await lifecycle.act("discardDraft");
      for (const draft of inlineDrafts.current.values()) draft.discard();
      inlineDrafts.current.clear(); setInlineDirty(false);
      setFormDirty(false); setFormEpoch((value) => value + 1);
    }),
  });
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
  // Publishing and submitting go through the shared sheet. An editor without
  // publication rights, or a revision of a proposal, can only submit for review.
  const canPublish = role === "admin" && !lifecycle.revisionOf;
  const sheetActions: PublishAction[] = canPublish ? ["Publish", "Submit for review"] : ["Submit for review"];
  const countLabel = changes.length === 1 ? "1 change" : `${changes.length} changes`;
  const submitted = () => {
    // The page now shows the published article; open forms must not keep
    // offering the submitted values as fresh edits.
    for (const draft of inlineDrafts.current.values()) draft.discard();
    inlineDrafts.current.clear(); setInlineDirty(false);
    setFormDirty(false); setFormEpoch((value) => value + 1);
  };
  const publishFromSheet = (action: PublishAction) => attempt(async () => {
    const publishing = action === "Publish" && canPublish;
    await lifecycle.act(publishing ? "publish" : "submit", summary);
    if (!publishing) submitted();
    // The write answered with the published article and the lifecycle has
    // already adopted it. Refreshing the route here would re-run the page
    // and re-drain the editor library, which reads as a reload of work the
    // editor just watched land.
    setSummary(""); setSummaryEdited(false); setReview(false);
  });
  const publicPath = `/${slug ?? ""}`;
  const receipt = usePublicationReceipt();
  const startReceipt = receipt.start;
  // Every publish or restore answers with a fresh notice; track its delivery.
  useEffect(() => {
    if (lifecycle.publication && slug) startReceipt([{ kind: "article", slug }], lifecycle.publication.receipts);
  }, [lifecycle.publication, slug, startReceipt]);
  const retryControl = lifecycle.uncertain ? <Button variant="outline" disabled={lifecycle.busy} onClick={() => {
    void attempt(async () => { await lifecycle.retry(); setFormDirty(false); setFormEpoch((value) => value + 1); setRestore(null); closePanel(); router.refresh(); });
  }}>Retry previous operation</Button> : null;
  const pendingProposals = lifecycle.proposals.filter((proposal) => proposal.status === "submitted").length;
  // Until the refreshed list names it, the proposal just submitted is pending;
  // once review decides it, the chip gives way to the list's own status.
  const submittedStatus = lifecycle.proposals.find((proposal) => proposal._id === lifecycle.submittedProposalId)?.status;
  const pendingChipId = lifecycle.submittedProposalId && (!submittedStatus || submittedStatus === "submitted") ? lifecycle.submittedProposalId : null;
  const pendingLabel = pendingProposals === 1 ? "1 proposal pending on this article" : `${pendingProposals} proposals pending on this article`;
  const status = lifecycle.uncertain ? "Previous operation unconfirmed. Editing is paused until it is reconciled." : !lifecycle.loaded ? (lifecycle.error ? "Article editing state could not be loaded." : "Loading article and private draft…") : lifecycle.busy ? "Loading or saving…" : lifecycle.publication ? "Saved on the editor host" : lifecycle.notice ?? (lifecycle.dirty || formDirty || inlineDirty ? "Unsaved local edits" : lifecycle.hasDraft ? "Private draft loaded" : "Published article loaded");
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
          {(pendingChipId || pendingProposals > 0) && <p className="theme-text-muted flex shrink-0 flex-wrap items-center gap-2 text-xs">
            {pendingChipId && <Link href="/dev/queue" className="theme-text-primary rounded-full border border-dose-border px-2 py-0.5 underline-offset-2 hover:underline">Proposal #{pendingChipId.slice(0, 6)} pending</Link>}
            {pendingProposals > 0 && <span>{pendingLabel}</span>}
          </p>}
        </div>
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-1">
          {lifecycle.ready ? <>
            <Button variant="ghost" size="sm" disabled={operationLocked || !localDirty} onClick={requestDiscardLocal}>Discard</Button>
            <Button variant="outline" size="sm" disabled={operationLocked} onClick={() => { void attempt(saveDraft); }}>Save draft</Button>
            <Button size="sm" className="h-auto min-h-9 max-w-full whitespace-normal px-3" disabled={operationLocked} onClick={() => { void attempt(prepareReview); }}>{changes.length > 0 ? `Review (${countLabel})` : "Review"}</Button>
          </> :!lifecycle.loaded && <Button variant="outline" size="icon" aria-label="Load private draft" title="Load private draft" disabled={requestLocked} onClick={() => { void lifecycle.load(); }}><Icon icon="lucide:download" size={16} /></Button>}
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
              {lifecycle.ready && lifecycle.hasDraft && <DropdownMenuItem className="min-h-11" disabled={operationLocked} onSelect={requestDiscardDraft}><Icon icon="lucide:trash-2" size={16} />Discard saved draft</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!lifecycle.ready && lifecycle.loaded && <p role="alert" className="theme-text-primary px-1 py-2 text-sm">{lifecycle.baselineRefreshRequired ? "The saved draft was discarded. Refresh and reconcile the latest article before editing; your local copy remains here." : "Article writes are paused. Your edits remain here; no operation will resume automatically after sign-in."}</p>}
      {lifecycle.publication && <div data-testid="article-publication-notice" className="theme-text-primary space-y-2 px-1 py-2 text-sm">
        <p>
          {publicationMessage(receipt.receipt?.public ?? lifecycle.publication.delivery)}{" "}
          <Link href={lifecycle.publication.path} className="underline underline-offset-2">Open the public article</Link>
        </p>
        {receipt.receipt && <PublicationReceiptChips receipt={receipt.receipt} />}
      </div>}
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
      leaveGuard.guard(closePanel);
    }}>
      <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
        {section && <fieldset className="min-w-0" disabled={operationLocked} onInput={() => setFormDirty(true)}><ArticleSectionForm key={`${section}:${formEpoch}`} article={lifecycle.article} slug={slug} section={section} form={form} handleRef={formRef} /></fieldset>}
        {review && <>
          {changes.length === 0 ? <section className="space-y-2">
            <h3 className="theme-text-primary font-semibold">Your changes</h3>
            <p className="theme-text-muted text-sm">No article fields changed.</p>
          </section> : <PublishSheet
            changes={<ArticleChangeDiff before={lifecycle.published} after={lifecycle.article} />}
            targets={[publicPath, "/changes"]}
            actions={sheetActions}
            countLabel={countLabel}
            onPublish={publishFromSheet}
            receipt={receipt.receipt}
            disabled={operationLocked}
            busy={lifecycle.busy}
            description={canPublish
              ? "Publishing changes the live article and its derived displays for all readers. Route and country identities are guarded against the loaded article revision. Classification changes affect this substance's index memberships; shared taxonomies and other articles remain unchanged."
              : "Submitting sends this change to an admin for review. The published article stays unchanged until it is approved."}
            note={{
              value: summary,
              onChange: (value) => { setSummary(value); setSummaryEdited(true); },
              hint: "Written from the changed fields. Edit it if the change deserves more than the diff already says.",
            }}
            problems={problems.length > 0 ? <div role="alert" className="theme-text-primary space-y-2 text-sm">{problems.map((problem, index) => {
              const sectionId = problem.sectionId;
              return <div key={index} className="space-y-1"><p>{describeValidationIssue(problem)}</p>{sectionId && <Button variant="outline" size="sm" disabled={operationLocked} onClick={() => openSection(sectionId)}>Edit {ARTICLE_SECTION_LABELS[sectionId].toLowerCase()}</Button>}</div>;
            })}</div> : undefined}
          />}
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
          <Button variant="outline" size="sm" disabled={operationLocked} onClick={() => { void attempt(saveDraft); }}>Save draft</Button>
          <Button size="sm" disabled={operationLocked} onClick={() => { void attempt(prepareReview); }}>Review</Button>
          {/* Cancel takes the same path as Escape: it asks while anything is unsaved. */}
          <Button variant="ghost" size="sm" disabled={operationLocked} onClick={() => leaveGuard.guard(closePanel)}>Cancel</Button>
        </EditorToolbar>}
        {(localError || lifecycle.error) && <p role="alert" className="theme-text-primary whitespace-pre-wrap text-sm">{localError || lifecycle.error}</p>}
        {retryControl}
        {refreshControl}
      </div>
    </ContextualEditorPanel>
    {leaveGuard.dialog}
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
    {confirmDialog}
  </ArticleSectionEditorContext.Provider>;
}
