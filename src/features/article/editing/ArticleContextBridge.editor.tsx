"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { Badge } from "@/components/ui/badge";
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
import { isArticleEditorSection } from "./articleSections";
import { ArticleChangeDiff, articleFieldChanges } from "./ArticleChangeDiff";
import { synthesizeChangeNote } from "./changeNote";
import { ArticleProposalReview } from "./ArticleProposalReview";
import { ArticleMergeReview } from "./ArticleMergeReview";
import { unresolvedConflictText } from "@/features/dev/components/MergeConflictChoices";
import { useArticleLifecycle, articlePublicationErrors, describeValidationIssue, fieldIssueMessage, type ArticleRevision } from "./useArticleLifecycle";
import type { SubstanceArticle } from "@/schema";
import { CORRECTION_FEEDBACK_PARAM, CORRECTION_RETURN_PARAM, CORRECTION_SECTION_PARAM, readCorrectionParams, readCorrectionReturn } from "@/features/intake/feedbackCorrection";
import { useArticleForm } from "@/hooks/useArticleForm";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Notice, SaveLine } from "@/features/dev/components";
import { RelativeDay } from "@/features/dev/tools/home/homeParts";
import { useModifierKeyLabel } from "@/features/dev/pages/DevCommandPalette";
import { ButtonKeyCap, DockBlocker, DraftStatePhrase, SaveDock, SessionLine, SessionLink, SessionStrip } from "./ArticleWorkbenchChrome";
import { countChanges, describeChangedSections, describeDraftState, describeLifecycleFailure, PENDING_WORDS, safetyChanges } from "./articleSessionModel";
import { ARTICLE_EDITOR_SECTIONS, articleSectionForPath } from "./articleSections";
import { articleDoseWarnings } from "@/features/dev/forms/doseRouteChecks";
import { INTERACTION_TIER_LABELS, interactionOverlaps } from "@/features/dev/forms/interactionChecks";

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
  /**
   * `bar` (default): the full-width editing bar over the article, for the
   * public page and Review. `dock`: the Substances tool's pane, with a strip
   * over the article and a save dock under it.
   */
  chrome?: "bar" | "dock";
  /** Dock chrome: the pane header, drawn inside the editing session. */
  header?: ReactNode;
  /** Called after a draft save, discard, submission or publication lands, so a list can refresh its marks. */
  onWorkChange?: () => void;
};

export default function ArticleContextBridge(props: ArticleContextBridgeProps) {
  const context = useContextualEditing();
  const email = props.workbenchEmail === undefined ? context.email : props.workbenchEmail;
  const owner = useRef(email);
  // Retain unsaved work while signed out, but never carry it into another account.
  if (email) owner.current = email;
  return <ArticleEditingSession key={`${props.slug ?? ""}:${owner.current ?? ""}`} {...props} />;
}

function StickyArticleEditorLayout({ actions, children, className }: { actions: ReactNode | null; children: ReactNode; className?: string }) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    const bar = barRef.current;
    if (!scope) return;
    const header = document.querySelector<HTMLElement>(".app-header");
    const strip = scope.querySelector<HTMLElement>(".theme-toc-strip-shell");
    const inReviewWorkbench = !!scope.closest(".theme-review-article-scope");
    const publish = () => {
      scope.style.setProperty("--article-editor-top", header
        ? `${header.getBoundingClientRect().height}px`
        : inReviewWorkbench ? "var(--review-bar-height, 3.25rem)" : "0px");
      scope.style.setProperty("--article-editor-bar-height", bar ? `${bar.getBoundingClientRect().height}px` : "0px");
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

  return <div ref={scopeRef} className={`theme-article-editor-scope min-w-0 ${className ?? ""}`}>
    {actions !== null ? <div ref={barRef} className="theme-article-editor-bar theme-chrome-dark sticky z-40 mx-[calc(50%-50vw)]">
      <div className="mx-auto max-w-[1500px] px-[max(1rem,env(safe-area-inset-left))] py-1 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
        {actions}
      </div>
    </div> : null}
    {children}
  </div>;
}

function ArticleEditingSession({ slug, article, children, layoutProps, workbench = false, workbenchRole, workbenchEmail, requestedSection, onSectionClose, onDirtyChange, draftGuardRef, onOperationLockChange, chrome = "bar", header, onWorkChange }: ArticleContextBridgeProps) {
  const dock = chrome === "dock";
  const saveKeyLabel = useModifierKeyLabel("S");
  const context = useContextualEditing();
  const viewerEmail = workbench ? workbenchEmail ?? null : context.email;
  const router = useRouter();
  const role = workbench ? workbenchRole ?? null : context.role;
  const active = !!slug && canDraft(role) && (workbench || (context.enabled && context.mode === "edit"));
  // In view mode an editor still learns whether a saved private draft waits
  // here; the same snapshot then serves edit mode without a second load.
  const viewing = !!slug && canDraft(role) && !workbench && context.enabled && context.mode === "view";
  const lifecycle = useArticleLifecycle(slug ?? "", article, active || viewing);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalNotesDirty, setProposalNotesDirty] = useState(false);
  const resetProposalNotes = useRef<() => void>(() => {});
  const requestLocked = lifecycle.busy || lifecycle.uncertain || proposalBusy;
  const operationLocked = requestLocked || !!lifecycle.recovery || lifecycle.baselineRefreshRequired;
  const [section, setSection] = useState<ArticleEditorSection | null>(null);
  const [review, setReview] = useState(false);
  // Start correction (the feedback review) opens this page with the feedback
  // id and a section. Read once: the proposal submitted here carries the id.
  const [correction] = useState(() => typeof window === "undefined" || workbench ? null : readCorrectionParams(window.location.search));
  const correctionSection = isArticleEditorSection(correction?.section) ? correction.section : null;
  // The feedback task link that opened this correction (the queue, its filters
  // and the item), kept past submit so the editor can go back to the same place.
  const [returnTo] = useState(() => typeof window === "undefined" || workbench ? null : readCorrectionReturn(window.location.search));
  const setFeedbackRef = lifecycle.setFeedbackRef;
  useEffect(() => { if (correction) setFeedbackRef(correction); }, [correction, setFeedbackRef]);
  const correctionModeSet = useRef(false);
  const setMode = context.setMode;
  useEffect(() => {
    if (!correction || correctionModeSet.current || !context.enabled || !canDraft(role)) return;
    correctionModeSet.current = true;
    if (context.mode !== "edit") setMode?.("edit");
  }, [correction, context.enabled, context.mode, role, setMode]);
  const detachCorrection = useCallback(() => {
    setFeedbackRef(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete(CORRECTION_FEEDBACK_PARAM);
    url.searchParams.delete(CORRECTION_SECTION_PARAM);
    url.searchParams.delete(CORRECTION_RETURN_PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [setFeedbackRef]);
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
  const openOnSection = requestedSection ?? correctionSection;
  useEffect(() => { if (openOnSection && active) setSection(openOnSection); }, [openOnSection, active]);
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
    if (operationLocked) throw new Error("Retry the unconfirmed change before saving a private draft.");
    if (proposalNotesDirty) throw new Error("Post or discard the proposal notes before saving an article draft.");
    const candidate = await collect();
    await lifecycle.act("saveDraft", summary, undefined, candidate);
    setFormDirty(false); setFormEpoch((value) => value + 1);
    onWorkChange?.();
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
    try { await operation(); } catch (failure) { setLocalError(failure instanceof Error ? failure.message : "The change was not confirmed. Your edits are kept."); }
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
      onWorkChange?.();
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
    if (requestLocked || proposalNotesDirty) throw new Error("Finish the unconfirmed change or the proposal notes before loading the latest published version.");
    lifecycle.preview(await collect());
    setFormDirty(false); setFormEpoch((value) => value + 1); closePanel();
    await lifecycle.refresh();
  };
  const refreshControl = lifecycle.loaded ? <Button variant="outline" size="sm" disabled={requestLocked || !!lifecycle.recovery || proposalNotesDirty} onClick={() => { void attempt(refreshBaseline); }}>Load latest published version</Button> : null;
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
    const linkedFeedback = !!lifecycle.feedbackRef;
    await lifecycle.act(publishing ? "publish" : "submit", summary);
    if (!publishing) submitted();
    onWorkChange?.();
    // The change now carries the feedback; a reload must not attach it to another one.
    if (linkedFeedback) detachCorrection();
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
  }}>Retry unconfirmed change</Button> : null;
  const pendingProposals = lifecycle.proposals.filter((proposal) => proposal.status === "submitted").length;
  // Until the refreshed list names it, the proposal just submitted is pending;
  // once review decides it, the chip gives way to the list's own status.
  const submittedStatus = lifecycle.proposals.find((proposal) => proposal._id === lifecycle.submittedProposalId)?.status;
  const pendingChipId = lifecycle.submittedProposalId && (!submittedStatus || submittedStatus === "submitted") ? lifecycle.submittedProposalId : null;
  const pendingLabel = pendingProposals === 1 ? "1 proposal pending on this article" : `${pendingProposals} proposals pending on this article`;
  const proposalPending = !!pendingChipId || pendingProposals > 0;
  // The launcher badges this page while a proposal on it waits for review.
  const setPending = context.setPending;
  useEffect(() => {
    setPending?.(guardKey, proposalPending);
    return () => setPending?.(guardKey, false);
  }, [setPending, guardKey, proposalPending]);
  // The same validation the review sheet lists, read per field so an applied
  // edit shows its problem beside the value instead of at review time.
  const fieldIssue = useCallback((path: string) => fieldIssueMessage(problems, path), [problems]);
  // Dock chrome: the result the editor dismissed, so the same result does not come back.
  const [dismissedResult, setDismissedResult] = useState<string | null>(null);
  const saveDraftRef = useRef<() => void>(() => {});
  saveDraftRef.current = () => { if (lifecycle.ready && !operationLocked && !proposalNotesDirty) void attempt(saveDraft); };
  // Cmd/Ctrl+S saves the private draft. It publishes nothing, so it needs no confirm; a dialog
  // (a section form, the review sheet) handles its own keys.
  useEffect(() => {
    if (!dock || !active) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      saveDraftRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dock, active]);
  const status = lifecycle.uncertain ? "Your last change was not confirmed. Editing is paused until you retry it." : !lifecycle.loaded ? (lifecycle.error ? "Article editing state could not be loaded." : "Loading article and private draft…") : lifecycle.busy ? "Loading or saving…" : lifecycle.publication ? "Saved on the editor host" : lifecycle.notice ?? (lifecycle.dirty || formDirty || inlineDirty ? "Unsaved local edits" : lifecycle.hasDraft ? "Private draft loaded" : "Published article loaded");
  if (!active) return <>
    {dock ? header : null}
    {viewing && lifecycle.hasDraft && <div className="mx-auto flex max-w-[1500px] justify-end px-[max(1rem,env(safe-area-inset-left))] pt-3 sm:px-6">
      {context.setMode
        ? <Button variant="outline" size="chip" data-private-draft-chip title="Open edit mode to continue your saved private draft." onClick={() => context.setMode?.("edit")}><Icon icon="lucide:file-pen-line" size={14} aria-hidden />You have a private draft</Button>
        : <Badge asChild variant="outline"><p data-private-draft-chip><Icon icon="lucide:file-pen-line" size={14} aria-hidden className="me-1" />You have a private draft</p></Badge>}
    </div>}
    {children}
  </>;
  if (lifecycle.expired) return <>
    {dock ? header : null}
    <Surface variant="subtle" padding="md" className={dock ? "m-4 space-y-3 sm:m-5" : "mx-auto mb-6 max-w-5xl space-y-3"}>
      <p role="alert" className="theme-text-primary">Article access has expired or changed. Your private draft is concealed and retained in this tab. Nothing will save or publish automatically.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><a href={`/sign-in?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`} target="_blank" rel="noopener noreferrer">Sign in in a new tab</a></Button>
        <Button variant="outline" disabled={requestLocked} onClick={() => { void attempt(refreshBaseline); }}>Load latest published version</Button>
      </div>
      {lifecycle.error && <p role="alert" className="theme-text-muted text-sm">{lifecycle.error}</p>}
    </Surface>
    {children}
  </>;
  const articleName = lifecycle.article.title || lifecycle.article.identification?.common_name || slug || "This article";
  const issueLines = (text: string) => text.split("\n").filter(Boolean);
  const errorText = localError || lifecycle.error;
  const sectionFooter = <div className="space-y-2">
    {errorText ? <div role="alert" className="theme-danger-text space-y-1 text-sm">
      {issueLines(errorText).length > 1 ? <>
        <p className="font-medium">Fix these before this section can apply:</p>
        <ul className="list-disc space-y-0.5 ps-5">{issueLines(errorText).map((line) => <li key={line}>{line}</li>)}</ul>
      </> : <p className="whitespace-pre-wrap">{errorText}</p>}
    </div> : null}
    {retryControl || refreshControl ? <div className="flex flex-wrap gap-2">{retryControl}{lifecycle.error ? refreshControl : null}</div> : null}
    <EditorToolbar variant="compact" label="Section editing actions" className="flex-wrap gap-2">
      <Button variant="accent" size="sm" disabled={operationLocked} onClick={() => { void attempt(preview); }}>Apply to preview</Button>
      <Button variant="outline" size="sm" disabled={operationLocked} onClick={() => { void attempt(prepareReview); }}>Review</Button>
      <Button variant="outline" size="sm" disabled={operationLocked} aria-keyshortcuts="Meta+S Control+S" onClick={() => { void attempt(saveDraft); }}>Save draft<ButtonKeyCap label={saveKeyLabel} /></Button>
      {/* Cancel takes the same path as Escape: it asks while anything is unsaved. */}
      <Button variant="ghost" size="sm" disabled={operationLocked} onClick={() => leaveGuard.guard(closePanel)}>Cancel</Button>
    </EditorToolbar>
    <p className="theme-text-faint text-xs max-sm:hidden">Apply to preview shows the change in the article here. Nothing leaves this browser until you save a draft{canPublish ? ", submit or publish" : " or submit"}.</p>
  </div>;

  // The one result the dock shows, most urgent first.
  const result: { key: string; tone: "danger" | "warning" | "success" | "info"; title?: string; message: ReactNode; actions?: ReactNode; testId?: string; dismiss?: () => void } | null = lifecycle.uncertain
    ? { key: "uncertain", tone: "danger", title: "Your last change was not confirmed", message: "No answer came back, so it may or may not have landed. Retry sends the same change again; editing waits until then.", actions: retryControl }
    : lifecycle.failure
      ? {
        key: `failure:${lifecycle.failure.kind}:${lifecycle.failure.action}:${lifecycle.failure.message}`,
        tone: lifecycle.failure.kind === "refused" ? "danger" : "warning",
        message: <span className="whitespace-pre-wrap">{describeLifecycleFailure(lifecycle.failure)}</span>,
        actions: lifecycle.failure.kind === "conflict" ? <Button type="button" variant="outline" size="sm" disabled={requestLocked || !!lifecycle.recovery || proposalNotesDirty} onClick={() => { void attempt(refreshBaseline); }}>Load the latest version</Button> : undefined,
        dismiss: lifecycle.clearFailure,
      }
      : errorText && !section
        ? { key: `error:${errorText}`, tone: "danger", message: issueLines(errorText).length > 1 ? <ul className="list-disc space-y-0.5 ps-5">{issueLines(errorText).map((line) => <li key={line}>{line}</li>)}</ul> : errorText, actions: !lifecycle.loaded ? <Button type="button" variant="outline" size="sm" disabled={requestLocked} onClick={() => { void lifecycle.load(); }}>Try again</Button> : undefined }
        : lifecycle.publication
          ? { key: `publication:${lifecycle.publication.message}`, tone: receipt.receipt?.public === "failed" || lifecycle.publication.delivery === "failed" ? "warning" : "success", testId: "article-publication-notice", message: <span className="space-y-2">
            <span className="block">{publicationMessage(receipt.receipt?.public ?? lifecycle.publication.delivery)} <SessionLink href={lifecycle.publication.path} external>Open the public article</SessionLink></span>
            {receipt.receipt ? <PublicationReceiptChips receipt={receipt.receipt} /> : null}
          </span> }
          : lifecycle.notice
            ? { key: `notice:${lifecycle.notice}`, tone: "success", message: lifecycle.notice, actions: pendingChipId && lifecycle.notice.startsWith("Submitted") ? <SessionLink href={`/dev/queue/${encodeURIComponent(pendingChipId)}`}>Open in Change Review</SessionLink> : undefined }
            : null;
  const shownResult = result && result.key !== dismissedResult ? result : null;
  // Inside the review sheet a refusal lands under Publish, where it was pressed.
  const sheetResult = result && (result.tone === "danger" || result.tone === "warning")
    ? <Notice tone={result.tone} title={result.title} message={result.message} actions={result.actions} className="text-sm" />
    : null;
  const pendingText = lifecycle.pendingAction ? PENDING_WORDS[lifecycle.pendingAction] : !lifecycle.loaded && !lifecycle.error ? "Loading your draft and this article's history" : null;
  const blocker = lifecycle.baselineRefreshRequired
    ? <DockBlocker action={<Button type="button" variant="outline" size="sm" disabled={requestLocked} onClick={() => { void attempt(refreshBaseline); }}>Load the latest version</Button>}>The saved draft was discarded. Load the latest published version and merge your edits before editing; your local copy stays here.</DockBlocker>
    : lifecycle.loaded && !lifecycle.ready
      ? <DockBlocker>Article saving is paused. Your edits stay here; nothing is saved or published on its own.</DockBlocker>
      : proposalNotesDirty
        ? <DockBlocker action={<Button type="button" variant="link" size="quiet" onClick={() => { void attempt(prepareReview); }}>Open the notes</Button>}>Post or discard your proposal notes in Review before saving a draft.</DockBlocker>
        : null;
  const draftState = describeDraftState({ busy: pendingText, localDirty, hasDraft: lifecycle.hasDraft, changeCount: changes.length });
  const problemSections = new Set(problems.map((problem) => problem.sectionId).filter(Boolean));
  const changedSectionIds = new Set(changes.map((change) => articleSectionForPath(change.path)).filter(Boolean));
  const saveDock = <SaveDock
    result={shownResult ? <Notice
      tone={shownResult.tone}
      title={shownResult.title}
      message={shownResult.message}
      actions={shownResult.actions}
      className="text-sm"
      dismiss={lifecycle.uncertain ? undefined : () => { shownResult.dismiss?.(); setDismissedResult(shownResult.key); }}
    /> : null}
    pending={pendingText}
    blocker={blocker}
    actions={<>
      <Button type="button" variant={changes.length > 0 && !operationLocked ? "accent" : "outline"} size="sm" disabled={operationLocked || !lifecycle.ready} onClick={() => { void attempt(prepareReview); }}>
        {changes.length > 0 ? `Review ${countChanges(changes.length)}` : "Review"}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={operationLocked || !lifecycle.ready || proposalNotesDirty} aria-keyshortcuts="Meta+S Control+S" onClick={() => { void attempt(saveDraft); }}>
        Save draft<ButtonKeyCap label={saveKeyLabel} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={!lifecycle.ready || operationLocked}>
            <Icon icon="lucide:pencil" size={14} aria-hidden /><span className="sm:hidden">Sections</span><span className="max-sm:hidden">Edit a section</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" collisionPadding={16} className="max-h-[min(70dvh,32rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto">
          {ARTICLE_EDITOR_SECTIONS.map((id) => <DropdownMenuItem key={id} className="min-h-11 justify-between gap-3" onSelect={() => openSection(id)}>
            <span>{ARTICLE_SECTION_LABELS[id]}</span>
            <span className="flex items-center gap-1.5 text-xs">
              {problemSections.has(id) ? <span className="theme-danger-text flex items-center gap-1"><Icon icon="lucide:circle-alert" size={12} aria-hidden />Needs a fix</span>
                : changedSectionIds.has(id) ? <span className="theme-text-muted flex items-center gap-1"><span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />Changed</span> : null}
            </span>
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button type="button" variant="ghost" size="sm" className="max-sm:hidden" disabled={operationLocked || !localDirty} onClick={requestDiscardLocal}>Discard edits</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className={`sm:ms-auto ${TOUCH_ICON}`} aria-label="Editing options" title="Editing options"><Icon icon="lucide:ellipsis" size={16} /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={16} className="w-72 max-w-[calc(100vw-2rem)]">
          <p className="theme-text-primary px-2 py-2 text-sm">{status}</p>
          {lifecycle.loaded && <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11" disabled={requestLocked || !!lifecycle.recovery || proposalNotesDirty} onSelect={() => { void attempt(refreshBaseline); }}><Icon icon="lucide:refresh-cw" size={16} />Load latest published version</DropdownMenuItem>
          </>}
          {lifecycle.ready && lifecycle.hasDraft && <DropdownMenuItem className="min-h-11" disabled={operationLocked} onSelect={requestDiscardDraft}><Icon icon="lucide:trash-2" size={16} />Discard saved draft</DropdownMenuItem>}
          {lifecycle.ready && <DropdownMenuItem className="min-h-11" disabled={operationLocked} onSelect={() => { void attempt(prepareReview); }}><Icon icon="lucide:history" size={16} />History and proposals</DropdownMenuItem>}
          {/* Phones keep Discard edits here so the dock stays one row of buttons. */}
          {lifecycle.ready && <DropdownMenuItem className="min-h-11 sm:hidden" disabled={operationLocked || !localDirty} onSelect={requestDiscardLocal}><Icon icon="lucide:undo-2" size={16} />Discard edits</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </>}
    state={<DraftStatePhrase text={draftState.text} unsaved={draftState.unsaved} />}
    saveLine={<SaveLine model="record" destination={canPublish ? "live" : "proposal"} />}
  />;
  // The strip names the proposal just submitted on its own line; this line counts the rest.
  const otherPending = lifecycle.proposals.filter((proposal) => proposal.status === "submitted" && proposal._id !== pendingChipId).length;
  const dockStrip = <SessionStrip>
    {lifecycle.hasDraft ? <SessionLine key="draft" icon="lucide:file-pen-line" tone="accent">
      You are looking at your private draft{lifecycle.draftSavedAt ? <>, saved <RelativeDay iso={lifecycle.draftSavedAt} /></> : null}. Readers still see the published article.
    </SessionLine> : changes.length > 0 ? <SessionLine key="preview" icon="lucide:eye" tone="accent">
      This page shows your edits. Readers still see the published article.
    </SessionLine> : null}
    {lifecycle.revisionOf ? <SessionLine key="revision" icon="lucide:git-branch">
      This draft revises proposal #{lifecycle.revisionOf.slice(0, 6)}, so it goes to review when you submit it.
    </SessionLine> : null}
    {pendingChipId ? <SessionLine key="mine" icon="lucide:send" actions={<SessionLink href={`/dev/queue/${encodeURIComponent(pendingChipId)}`}>Open in Change Review</SessionLink>}>
      Your proposal #{pendingChipId.slice(0, 6)} is waiting for review.
    </SessionLine> : null}
    {otherPending > 0 ? <SessionLine key="pending" icon="lucide:inbox" tone="warning" actions={<Button type="button" variant="link" size="quiet" className="h-auto p-0" disabled={operationLocked} onClick={() => { void attempt(prepareReview); }}>See them</Button>}>
      {otherPending === 1 ? `1 ${pendingChipId ? "other " : ""}proposal on this article is waiting for review.` : `${otherPending} ${pendingChipId ? "other " : ""}proposals on this article are waiting for review.`}{canPublish ? " Publishing over it may make it stale." : ""}
    </SessionLine> : null}
    {lifecycle.feedbackRef ? <SessionLine key="feedback" icon="lucide:message-square-text" actions={<Button type="button" variant="link" size="quiet" className="h-auto p-0" disabled={requestLocked} onClick={detachCorrection}>Detach</Button>}>
      <span data-feedback-correction>Correcting reader feedback #{lifecycle.feedbackRef.id.slice(-6)}</span>
    </SessionLine> : null}
    {returnTo ? <SessionLine key="back" icon="lucide:arrow-left" actions={<SessionLink href={returnTo}>Back to feedback</SessionLink>}>You opened this from reader feedback.</SessionLine> : null}
  </SessionStrip>;
  const safety = safetyChanges(changes);
  const interactionsChanged = safety.some((change) => change.path.startsWith("interactions"));
  const doseWarnings = safety.length > 0 ? [
    ...articleDoseWarnings(lifecycle.article, lifecycle.published),
    ...(interactionsChanged ? interactionOverlaps(lifecycle.article.interactions).map((overlap) => `Interactions: ${overlap.label} is listed under ${overlap.tiers.map((tier) => INTERACTION_TIER_LABELS[tier]).join(" and ")}.`) : []),
  ] : [];
  const warningList = doseWarnings.length > 0 ? <ul className="mt-2 list-disc space-y-1 ps-5">{doseWarnings.map((line) => <li key={line}>{line}</li>)}</ul> : null;
  const safetyLead = safety.length > 0 ? <Notice
    tone="warning"
    title={`Check ${safety.length === 1 ? "this dose, duration or interaction change" : `these ${safety.length} dose, duration and interaction changes`} before ${canPublish ? (safety.length === 1 ? "it goes out" : "they go out") : "you submit"}`}
    message={<>Readers dose and combine by these values. Compare each before and after below, including the unit.{warningList}</>}
    className="text-sm"
  /> : undefined;
  const confirmBody = <div className="space-y-4 text-sm">
    <p className="theme-text-secondary">{describeChangedSections(changes)}</p>
    {safety.length > 0 ? <section className="space-y-2">
      <h4 className="type-meta-label theme-text-muted">Doses, durations and interactions</h4>
      <ArticleChangeDiff changes={safety} />
    </section> : null}
    {doseWarnings.length > 0 ? <section className="theme-warning-text space-y-1">
      <h4 className="type-meta-label">Still to check</h4>
      <ul className="list-disc space-y-1 ps-5">{doseWarnings.map((line) => <li key={line}>{line}</li>)}</ul>
    </section> : null}
  </div>;
  const articleView = <ArticleEditProvider value={lifecycle.ready && !operationLocked ? { commit: lifecycle.commit, registerDraft, refreshStoredValue: lifecycle.refreshStoredValue, addReference: lifecycle.addReference, references: lifecycle.article.references ?? [], isChanged: lifecycle.isFieldChanged, fieldIssue } : null}>
    <ArticleLayout {...layoutProps} content={layoutProps?.content ? { ...layoutProps.content, chemistryPresentation: buildArticleChemistryPresentation(lifecycle.article) } : undefined} fromSubstanceSlug={slug} article={lifecycle.article} />
  </ArticleEditProvider>;
  return <ArticleSectionEditorContext.Provider value={lifecycle.ready && !operationLocked ? openSection : null}>
    {dock ? <StickyArticleEditorLayout actions={null} className="rounded-[inherit] [overflow-x:clip]">
      {header}
      {dockStrip}
      {/* A draft the renderer cannot draw must not drop the editor: the dock and the draft stay. */}
      <ErrorBoundary
        name="substances-article-preview"
        resetKeys={[lifecycle.article]}
        fallback={({ reset }) => <div role="alert" className="px-4 py-8 sm:px-5"><Notice
          tone="danger"
          title="This article could not be drawn"
          message="Something in it stops the page from rendering. Your edits and draft are untouched: open a section from Edit a section to fix it, or try drawing it again."
          actions={<Button type="button" variant="outline" size="sm" onClick={reset}>Try again</Button>}
        /></div>}
      >
        {articleView}
      </ErrorBoundary>
      {saveDock}
    </StickyArticleEditorLayout> : <StickyArticleEditorLayout actions={<>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-full sm:flex sm:basis-auto sm:items-center sm:gap-3">
          <p className="theme-text-primary shrink-0 text-sm font-semibold">{changes.length > 0 ? "Private preview" : "Editing"}</p>
          <p className="theme-text-muted truncate text-xs" role="status" title={status}>{status}</p>
          {(pendingChipId || pendingProposals > 0) && <p className="theme-text-muted flex shrink-0 flex-wrap items-center gap-2 text-xs">
            {pendingChipId && <Link href={`/dev/queue/${encodeURIComponent(pendingChipId)}`} className="theme-text-primary rounded-full border border-dose-border px-2 py-0.5 underline-offset-2 hover:underline">Proposal #{pendingChipId.slice(0, 6)} pending</Link>}
            {pendingProposals > 0 && <span>{pendingLabel}</span>}
          </p>}
          {lifecycle.feedbackRef && <p data-feedback-correction className="theme-text-muted flex shrink-0 flex-wrap items-center gap-1 text-xs">
            <span className="theme-text-primary rounded-full border border-dose-border px-2 py-0.5">Correcting reader feedback #{lifecycle.feedbackRef.id.slice(-6)}</span>
            <Button variant="ghost" size="sm" disabled={requestLocked} onClick={detachCorrection}>Detach</Button>
          </p>}
          {returnTo && <Link href={returnTo} className="theme-text-primary shrink-0 text-xs underline-offset-2 hover:underline">Back to feedback</Link>}
        </div>
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-1">
          {lifecycle.ready ? <>
            <Button variant="ghost" size="sm" disabled={operationLocked || !localDirty} onClick={requestDiscardLocal}>Discard</Button>
            <Button variant="outline" size="sm" disabled={operationLocked} onClick={() => { void attempt(saveDraft); }}>Save draft</Button>
            <Button size="sm" className="h-auto min-h-9 max-w-full whitespace-normal px-3" disabled={operationLocked} onClick={() => { void attempt(prepareReview); }}>{changes.length > 0 ? `Review (${countLabel})` : "Review"}</Button>
          </> :!lifecycle.loaded && <Button variant="outline" size="icon" aria-label="Load private draft" title="Load private draft" disabled={requestLocked} onClick={() => { void lifecycle.load(); }}><Icon icon="lucide:download" size={16} /></Button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Editing options" title="Editing options"><Icon icon="lucide:ellipsis" size={16} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={16} className="w-72 max-w-[calc(100vw-2rem)]">
              <p className="theme-text-primary px-2 py-2 text-sm">{status}</p>
              <p className="theme-text-muted px-2 pb-2 text-sm">Nothing publishes automatically. Save a private draft, or review the changed fields before submitting or publishing.</p>
              {lifecycle.loaded && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-11" disabled={requestLocked || !!lifecycle.recovery || proposalNotesDirty} onSelect={() => { void attempt(refreshBaseline); }}><Icon icon="lucide:refresh-cw" size={16} />Load latest published version</DropdownMenuItem>
              </>}
              {lifecycle.ready && lifecycle.hasDraft && <DropdownMenuItem className="min-h-11" disabled={operationLocked} onSelect={requestDiscardDraft}><Icon icon="lucide:trash-2" size={16} />Discard saved draft</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!lifecycle.ready && lifecycle.loaded && <p role="alert" className="theme-text-primary px-1 py-2 text-sm">{lifecycle.baselineRefreshRequired ? "The saved draft was discarded. Load the latest published version and merge your edits before editing; your local copy remains here." : "Article saving is paused. Your edits remain here; nothing is saved or published automatically after sign-in."}</p>}
      {lifecycle.publication && <div data-testid="article-publication-notice" className="theme-text-primary space-y-2 px-1 py-2 text-sm">
        <p>
          {publicationMessage(receipt.receipt?.public ?? lifecycle.publication.delivery)}{" "}
          <Link href={lifecycle.publication.path} className="underline underline-offset-2">Open the public article</Link>
        </p>
        {receipt.receipt && <PublicationReceiptChips receipt={receipt.receipt} />}
      </div>}
      {lifecycle.uncertain && <p className="theme-text-primary px-1 py-2 text-sm">{status}</p>}
      {/* A refused publish or save (the freeze, a conflict) stays in the bar once the review sheet closes, with its way forward. */}
      {lifecycle.failure && !review && !section ? <div className="px-1 py-2"><Notice
        tone={lifecycle.failure.kind === "refused" ? "danger" : "warning"}
        message={<span className="whitespace-pre-wrap">{describeLifecycleFailure(lifecycle.failure)}</span>}
        actions={lifecycle.failure.kind === "conflict" ? <Button type="button" variant="outline" size="sm" disabled={requestLocked || !!lifecycle.recovery || proposalNotesDirty} onClick={() => { void attempt(refreshBaseline); }}>Load the latest version</Button> : undefined}
        dismiss={lifecycle.clearFailure}
        className="text-sm"
      /></div> : null}
      {retryControl && <div className="px-1 py-2">{retryControl}</div>}
      {/* A classified refusal already speaks above in its own words; the raw server sentence stays for anything else. */}
      {(localError || lifecycle.error) && !(lifecycle.failure && !localError) && <p className="theme-text-primary whitespace-pre-wrap px-1 py-2 text-sm" role="alert">{localError || lifecycle.error}</p>}
    </>}>
    {/* The bar chrome keeps the same net as the dock: a draft the renderer cannot draw keeps the bar and the draft. */}
    <ErrorBoundary
      name="article-editor-preview"
      resetKeys={[lifecycle.article]}
      fallback={({ reset }) => <div role="alert" className="mx-auto max-w-3xl py-8"><Notice
        tone="danger"
        title="This article could not be drawn"
        message="Something in it stops the page from rendering. Your edits and draft are untouched: open a section to fix it, or try drawing it again."
        actions={<Button type="button" variant="outline" size="sm" onClick={reset}>Try again</Button>}
      /></div>}
    >
      {articleView}
    </ErrorBoundary>
    </StickyArticleEditorLayout>}
    <ContextualEditorPanel title={section ? `Edit ${ARTICLE_SECTION_LABELS[section].toLowerCase()}` : "Review article changes"} open={!!section || review} onOpenChange={(open) => {
      if (open) return;
      leaveGuard.guard(closePanel);
    }}
    description={dock ? `${articleName}. Changes stay private until you ${canPublish ? "publish them or submit them" : "submit them"} for review.` : undefined}
    onKeyDown={(event) => {
      // The save key saves a private draft from inside a section too.
      if (!section || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s" || event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (!operationLocked && !proposalNotesDirty) void attempt(saveDraft);
    }}
    footer={section ? sectionFooter : undefined}>
      <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
        {section && <fieldset className="min-w-0" disabled={operationLocked} onInput={() => setFormDirty(true)}><ArticleSectionForm key={`${section}:${formEpoch}`} article={lifecycle.article} published={lifecycle.loaded ? lifecycle.published : null} slug={slug} section={section} form={form} handleRef={formRef} /></fieldset>}
        {review && <>
          {changes.length === 0 ? <section className="space-y-2">
            <h3 className="theme-text-primary font-semibold">Your changes</h3>
            <p className="theme-text-muted text-sm">No article fields changed.</p>
          </section> : <PublishSheet
            changes={<ArticleChangeDiff before={lifecycle.published} after={lifecycle.article} />}
            targets={[publicPath, "/changes"]}
            actions={sheetActions}
            countLabel={countLabel}
            lead={safetyLead}
            confirmBody={confirmBody}
            confirmAffectedLabel="Updates these pages"
            confirmDestructive={doseWarnings.length > 0}
            result={sheetResult}
            onPublish={publishFromSheet}
            receipt={receipt.receipt}
            disabled={operationLocked}
            busy={lifecycle.busy}
            description={`${canPublish
              ? "Publishing changes the live article for every reader. It is refused if someone else published this article after you opened it. A classification change also moves this substance in the index; other articles stay as they are."
              : "Submitting sends this change to an admin for review. The published article stays unchanged until it is approved."}${lifecycle.feedbackRef
              ? ` The change is linked to reader feedback #${lifecycle.feedbackRef.id.slice(-6)} by its id only; the reader's contact details stay private.`
              : ""}`}
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
              <p className="theme-text-primary text-sm font-medium">{revision.summary}</p>
              <p className="theme-text-muted text-xs">{revision.actorEmail === viewerEmail ? "You" : revision.actorEmail}, <span title={new Date(revision.createdAt).toLocaleString()}><RelativeDay iso={revision.createdAt} /></span></p>
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
        {!section && !(review && changes.length > 0) && (localError || lifecycle.error) && <p role="alert" className="theme-text-primary whitespace-pre-wrap text-sm">{localError || lifecycle.error}</p>}
        {!section && retryControl}
        {!section && refreshControl}
      </div>
    </ContextualEditorPanel>
    {leaveGuard.dialog}
    <ContextualEditorPanel title="Merge with the latest version" open={!!lifecycle.recovery} onOpenChange={(open) => { if (!open && !requestLocked) lifecycle.cancelRecovery(); }} description="The latest public article and saved draft have been fetched. Your local draft is still unchanged. Nothing is saved or published by this review.">
      {lifecycle.recovery && lifecycle.merge && <div className="space-y-5 overflow-y-auto">
        <p className="theme-text-muted text-sm">Your draft is compared with the latest public article from the revision you started on. A field only one of you changed is already in the merged draft. A field you both changed waits for you to choose a version. Publishing still checks the latest revision, so a change that lands after this merge is refused.</p>
        <ArticleMergeReview merge={lifecycle.merge} choices={lifecycle.mergeChoices} onChoose={lifecycle.chooseMerge} />
        {lifecycle.recovery.draft && <section className="space-y-3">
          <h3 className="theme-text-primary font-semibold">Latest saved private draft compared with your local draft</h3>
          <ArticleChangeDiff before={lifecycle.recovery.draft.article} after={lifecycle.article} />
        </section>}
        <div className="flex flex-wrap gap-2">
          <Button className="h-auto min-h-11 max-w-full whitespace-normal" disabled={requestLocked || lifecycle.merge.unresolved.length > 0} onClick={() => { void attempt(async () => { lifecycle.reconcile(true); setFormEpoch((value) => value + 1); setReview(true); }); }}>Use the merged draft</Button>
          <Button variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal" disabled={requestLocked} onClick={() => { void attempt(async () => { lifecycle.reconcile(false); setFormEpoch((value) => value + 1); }); }}>{lifecycle.recovery.draft ? "Discard local edits and load saved draft" : "Discard local edits and load published article"}</Button>
          <Button variant="ghost" disabled={requestLocked} onClick={() => lifecycle.cancelRecovery()}>Keep my current version</Button>
        </div>
        {lifecycle.merge.unresolved.length > 0 && <p className="theme-text-muted text-sm">{unresolvedConflictText(lifecycle.merge.unresolved.length)}</p>}
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
