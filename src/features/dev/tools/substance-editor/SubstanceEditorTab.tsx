"use client";

/**
 * Substances: the editor workspace for substance articles. The list column
 * (Listed, Your work, All; review state; search; order) sits left and sticky;
 * the open article sits right in a pane, drawn by the real public
 * `ArticleLayout` through the editor-only contextual editing layer
 * (`ArticleContextBridge` with `chrome="dock"`), with a strip over it that
 * says what the preview shows and a save dock under it. Phones show the list,
 * then the article with Back to list.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorPanel,
  EditorSection,
  EditorStatusPill,
  LoadErrorState,
  SaveLine,
  isTextEntryTarget,
  useDevShortcuts,
  useDirtyGuard,
  useScrollToDetail,
  useUnsavedWork,
} from "@/features/dev/components";
import { RowSkeletons } from "@/features/dev/tools/home/homeParts";
import { fetchMyWork } from "@/features/dev/tools/home/homeRequests";
import { cn } from "@/lib/utils";
import { viewToPath } from "@/utils/routing";
import { resolveEditorArticleSlug } from "../../context/devModeUtils";
import { resolveSessionRole } from "@/lib/auth/roles";
import { getDefaultEditorialReview, isDirectUrlOnlySubstance, type SubstanceArticle } from "@/schema";
import type { DraftNavigationGuard } from "@/features/contextual-editing/context";
import ArticleContextBridge from "@/features/article/editing/ArticleContextBridge.editor";
import { ArticleLayout } from "@/features/article/components/ArticleLayout";
import { useDevMode } from "../../context/DevModeContext";
import { SubstanceListColumn } from "./SubstanceListColumn";
import {
  filterRows,
  REVIEW_STATUS_META,
  reviewCounts as countReviews,
  viewCounts as countViews,
  workBySlug,
  type ArticleWork,
  type ReviewFilter,
  type SortOrder,
  type SubstanceRow,
  type SubstanceView,
} from "./substanceListModel";
import type { SubstanceEditorTabProps } from "./types";

const SHORTCUTS = [
  { keys: "/", label: "Find a substance" },
  { keys: "Cmd+S", label: "Save your private draft" },
] as const;

const REVIEW_FALLBACK = getDefaultEditorialReview().status;

/** The member's drafts and open proposals, keyed by article, for the row marks. */
function useArticleWork() {
  const [work, setWork] = useState<Map<string, ArticleWork> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const load = useCallback(() => {
    const id = ++request.current;
    setError(null);
    fetchMyWork()
      .then((answer) => { if (id === request.current) setWork(workBySlug(answer.drafts, answer.proposals)); })
      .catch((failure: unknown) => { if (id === request.current) setError(failure instanceof Error ? failure.message : "Unable to load your drafts and proposals."); });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { work, error, reload: load };
}

export const SubstanceEditorTab = memo(function SubstanceEditorTab({ initialSlug }: SubstanceEditorTabProps) {
  const { articles, articleHydration } = useDevMode();
  const session = useSession();
  const role = resolveSessionRole(session.data?.user ?? {});
  const canPublish = role === "admin";
  const corpus = articles as SubstanceArticle[];
  const articleWork = useArticleWork();

  const rows = useMemo<SubstanceRow[]>(() => corpus.flatMap((article) => {
    const slug = resolveEditorArticleSlug(article);
    if (!slug) return [];
    return [{
      slug,
      name: article.title || article.identification?.common_name || slug,
      reviewStatus: article.editorial_review?.status ?? REVIEW_FALLBACK,
      directUrlOnly: isDirectUrlOnlySubstance(article.priority),
      work: articleWork.work?.get(slug) ?? null,
    }];
  }), [corpus, articleWork.work]);

  const [selected, setSelected] = useState<string | null>(initialSlug ?? null);
  const [missingSlug, setMissingSlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<SortOrder>("alpha-asc");
  const [review, setReview] = useState<ReviewFilter>("any");
  // A deep link to an address-only article opens on All, so the list shows it.
  const [view, setView] = useState<SubstanceView>(() =>
    corpus.some((article) => resolveEditorArticleSlug(article) === initialSlug && isDirectUrlOnlySubstance(article.priority)) ? "all" : "listed");

  const shown = useMemo(() => filterRows(rows, { query, view, review, order }), [rows, query, view, review, order]);
  const viewCounts = useMemo(() => countViews(rows, query, review), [rows, query, review]);
  const reviewCounts = useMemo(() => countReviews(rows, query, view), [rows, query, view]);
  const selectedRow = rows.find((row) => row.slug === selected) ?? null;

  // An address that names no article says so at the list and leaves the address.
  useEffect(() => {
    if (!selected || selectedRow) return;
    setMissingSlug(selected);
    setSelected(null);
  }, [selected, selectedRow]);

  const [dirty, setDirty] = useState(false);
  const [operationLocked, setOperationLocked] = useState(false);
  const draftGuardRef = useRef<DraftNavigationGuard | null>(null);
  const saveDraft = async () => {
    if (!draftGuardRef.current?.save) throw new Error("The private draft is unavailable.");
    await draftGuardRef.current.save();
  };
  const dirtyGuard = useDirtyGuard(dirty, {
    title: "Keep your article edits?",
    description: "Save a private draft, discard local edits, or stay with this article. Nothing publishes automatically.",
    onSave: operationLocked ? undefined : saveDraft,
    onDiscard: () => draftGuardRef.current?.discard(),
    canDiscard: !operationLocked,
    // The shell's unsaved-work registry owns the browser tab.
    warnOnUnload: false,
  });
  // A rail switch, Leave or sign-out asks first while the open article holds unsaved edits.
  useUnsavedWork({
    id: "articles",
    label: `Substances: ${selectedRow?.name ?? "article"}`,
    dirty,
    save: operationLocked ? undefined : saveDraft,
    saveLabel: "Save draft",
    discard: () => draftGuardRef.current?.discard(),
  });

  const urlSlugRef = useRef(initialSlug ?? null);
  useEffect(() => {
    if (selected === urlSlugRef.current) return;
    urlSlugRef.current = selected;
    // Keep Next's history state: a null state reads as a navigation that scrolls to the top.
    window.history.replaceState(window.history.state, "", viewToPath({ type: "dev", tab: "articles", slug: selected ?? undefined }));
  }, [selected]);

  const { failedSlugs, isArticleHydrated, requestArticle } = articleHydration;
  const ready = isArticleHydrated(selected);
  useEffect(() => { if (selected && selectedRow) requestArticle(selected); }, [requestArticle, selected, selectedRow]);
  const article = ready ? corpus.find((candidate) => resolveEditorArticleSlug(candidate) === selected) ?? null : null;

  const handleSelect = useCallback((slug: string) => {
    setMissingSlug(null);
    if (slug !== selected) dirtyGuard.guard(() => setSelected(slug));
  }, [dirtyGuard, selected]);
  const closeArticle = () => dirtyGuard.guard(() => setSelected(null));

  const paneRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useScrollToDetail(paneRef, selected);
  // A deep link on a phone opens on the article, not the list above it.
  const deepLinked = useRef(!!initialSlug);
  useEffect(() => {
    if (!deepLinked.current || !article) return;
    deepLinked.current = false;
    if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1023.98px)").matches) {
      paneRef.current?.scrollIntoView({ block: "start" });
    }
  }, [article]);
  const backToList = () => {
    listRef.current?.scrollIntoView({ block: "start" });
    listRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
  };

  useDevShortcuts(SHORTCUTS);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const header = selectedRow ? (
    <PaneHeader
      row={selectedRow}
      headingRef={headingRef}
      onClose={closeArticle}
      onBackToList={backToList}
    />
  ) : null;

  return (
    <div className="mx-auto w-full max-w-[100rem]">
      {dirtyGuard.dialog}
      <EditorSection
        icon="lucide:flask-conical"
        title="Substances"
        description={canPublish
          ? "Edit an article where readers see it. Save a private draft as you go; publishing sends it live after you review the changes."
          : "Edit an article where readers see it. Save a private draft as you go; submitting sends it to an admin for review."}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
          <section ref={listRef} aria-label="Articles" className="scroll-mt-24 lg:sticky lg:top-24">
            <SubstanceListColumn
              rows={shown}
              total={rows.length}
              viewCounts={viewCounts}
              reviewCounts={reviewCounts}
              workKnown={!!articleWork.work}
              workError={articleWork.error}
              onRetryWork={articleWork.reload}
              view={view}
              onViewChange={setView}
              review={review}
              onReviewChange={setReview}
              order={order}
              onOrderChange={setOrder}
              query={query}
              onQueryChange={setQuery}
              searchRef={searchRef}
              selected={selected}
              selectedName={selectedRow?.name ?? null}
              selectedShown={!!selected && shown.some((row) => row.slug === selected)}
              dirty={dirty}
              onSelect={handleSelect}
              missingSlug={missingSlug}
              onDismissMissing={() => setMissingSlug(null)}
            />
          </section>

          <section
            ref={paneRef}
            aria-label={selectedRow ? `Article: ${selectedRow.name}` : "Article"}
            className={cn("min-w-0 scroll-mt-24", !selected && "hidden lg:block")}
          >
            {article && selected ? (
              <EditorPanel className="overflow-visible" data-testid="substance-editor-pane">
                <ArticleContextBridge
                  key={selected}
                  slug={selected}
                  article={article}
                  workbench
                  chrome="dock"
                  header={header}
                  workbenchRole={role}
                  workbenchEmail={session.data?.user?.email ?? null}
                  onDirtyChange={setDirty}
                  draftGuardRef={draftGuardRef}
                  onOperationLockChange={setOperationLocked}
                  onWorkChange={articleWork.reload}
                >
                  <ArticleLayout article={article} />
                </ArticleContextBridge>
              </EditorPanel>
            ) : selected && selectedRow && failedSlugs.has(selected) ? (
              <EditorPanel className="overflow-visible">
                {header}
                <div className="px-4 py-5 sm:px-5">
                  <LoadErrorState
                    what="this article"
                    message="The full article could not be loaded."
                    onRetry={() => requestArticle(selected)}
                    secondary={<a href={`/sign-in?callbackUrl=${encodeURIComponent(`/dev/articles/${selected}`)}`} target="_blank" rel="noreferrer" className="theme-accent-underline text-sm text-dose-accent-strong underline-offset-4 hover:underline">If your session ended, sign in again in a new tab</a>}
                  />
                </div>
              </EditorPanel>
            ) : selected && selectedRow ? (
              <EditorPanel className="overflow-visible" aria-busy="true">
                {header}
                <div className="space-y-3 px-4 py-5 sm:px-5">
                  <p role="status" className="theme-text-muted text-sm">Loading the article</p>
                  <RowSkeletons rows={4} label="the article" />
                </div>
              </EditorPanel>
            ) : (
              <IdlePane canPublish={canPublish} />
            )}
          </section>
        </div>
      </EditorSection>
    </div>
  );
});

/** The pane header: the article, its review state and address, View live, Close and Back to list. */
function PaneHeader({ row, headingRef, onClose, onBackToList }: {
  row: SubstanceRow;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onBackToList: () => void;
}) {
  const status = REVIEW_STATUS_META[row.reviewStatus] ?? REVIEW_STATUS_META.needed;
  const liveHref = `/${row.slug}`;
  return (
    <header className="theme-portal-rule relative space-y-2 border-b px-4 py-3.5 sm:px-5">
      <Button
        type="button"
        variant="iconGhost"
        size="icon"
        className={cn("absolute right-2 top-2 sm:right-3", TOUCH_ICON)}
        onClick={onClose}
        aria-label="Close the article"
        title="Close the article"
      >
        <Icon icon="lucide:x" size={18} />
      </Button>
      <div className="pr-12 lg:hidden">
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
          <Icon icon="lucide:arrow-left" size={14} />
          Back to list
        </Button>
      </div>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="theme-accent-heading min-w-0 break-words pr-12 text-xl font-semibold leading-tight outline-none"
      >
        <span className="sr-only">Editing </span>
        {row.name}
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <EditorStatusPill tone={status.tone} inline>{status.label}</EditorStatusPill>
        {row.directUrlOnly ? (
          <span className="theme-text-muted flex items-center gap-1 text-xs">
            <Icon icon="lucide:eye-off" size={13} aria-hidden />
            Readers reach it only by its address
          </span>
        ) : null}
        <a
          href={liveHref}
          target="_blank"
          rel="noreferrer"
          className="theme-focus-ring theme-accent-underline inline-flex min-h-11 items-center gap-1.5 rounded-control font-medium text-dose-accent-strong underline-offset-4 hover:underline sm:min-h-0"
        >
          View live
          <span className="sr-only">{`: ${liveHref}, opens in a new tab`}</span>
          <Icon icon="lucide:arrow-up-right" size={14} />
        </a>
        <span aria-hidden className="theme-text-faint break-all font-mono text-xs">{liveHref}</span>
      </div>
    </header>
  );
}

/** What the pane says on desktop before an article is open. Hidden on phones, where the list is the whole view. */
function IdlePane({ canPublish }: { canPublish: boolean }) {
  return (
    <EditorPanel variant="subtle" className="space-y-3 px-5 py-6">
      <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
        <Icon icon="lucide:file-pen-line" size={18} className="theme-icon-accent shrink-0" />
        Pick a substance to edit
      </p>
      <p className="theme-text-muted max-w-[62ch] text-sm">
        Its article opens here as readers see it. Click a value to change it in place, or use Edit a section for a whole
        section such as doses, durations or interactions. Your edits stay in a private draft until you{" "}
        {canPublish ? "publish them or submit them for review" : "submit them for review"}.
      </p>
      <SaveLine model="record" destination={canPublish ? "live" : "proposal"} />
    </EditorPanel>
  );
}
