"use client";
/**
 * The Terms view as a workspace: the language's progress across the top, the
 * categories on the left (search, the review-state filter, the file and model
 * actions, one row per category with its progress), and the open category on
 * the right with its bulk actions, its rows and a sticky dock that holds the
 * result of a whole-list write, what is running, and the way on to the next
 * category. A search lists every match, grouped, in the same pane.
 *
 * Below `lg` the pane follows the list: opening a category scrolls to it,
 * and the pane carries Back to list.
 */
import { useRef, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorPanel, EditorStatusPill, useScrollToDetail, type NoticeMessage } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { GlossaryGroupSection, reviewedShare, type GlossaryEditDrafts, type GlossaryRowNotice } from "./GlossaryReviewTable";
import { count, standingLabel, STATE_WORD, type GlossaryFilters, type GlossaryGroup, type GlossaryRow, type GlossaryRowPatch, type GlossaryStatusFilter, type ReviewCounts } from "./glossaryModel";
import { TermsOverview, type NextCategory } from "./TermsOverview";
import { BackToList, ChoiceGrid, PaneDock, ResultNotice, SearchField } from "./workbenchParts";
import type { GlossaryUsageMap } from "@/lib/glossary/glossaryUsage";
import type { ReviewReason } from "@server/translation/reviewReason";

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

type Totals = Record<string, { total: number; draft: number; unchecked: number }>;

export type TermsWorkspaceProps = {
  paneId: string;
  /** Every category with rows, from the unfiltered list, in site order: the list column shows them all. */
  allGroups: GlossaryGroup[];
  /** The categories the filters and search leave, with the rows they keep. */
  groups: GlossaryGroup[];
  totals: Totals;
  counts: ReviewCounts;
  totalRows: number;
  filters: GlossaryFilters;
  onSearch: (search: string) => void;
  onStatus: (status: GlossaryStatusFilter) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  category: string | null;
  onToggleCategory: (id: string) => void;
  onCloseCategory: () => void;
  next: NextCategory | null;
  canAdmin: boolean;
  canDefine: boolean;
  pendingCount: number;
  nothingTranslatedYet: boolean;
  locked: boolean;
  onContinue: (id: string) => void;
  onOpenRuns?: () => void;
  /** The More menu and the running-write pill. */
  actions: ReactNode;
  activity: string | null;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
  hasUnsaved: boolean;
  // Row plumbing, passed through to the groups.
  editDrafts: GlossaryEditDrafts;
  busy: boolean;
  writingTerm: string | null;
  glosses: Readonly<Record<string, string>>;
  usages: GlossaryUsageMap;
  rowNotice: GlossaryRowNotice | null;
  onApproveAll: (group: GlossaryGroup) => void;
  onConfirmAll: (group: GlossaryGroup) => void;
  onApprove: (row: GlossaryRow) => void;
  onConfirm: (row: GlossaryRow) => void;
  onSave: (row: GlossaryRow, target: string, reason: ReviewReason) => void;
  onSaveAndApprove: (row: GlossaryRow, target: string, reason: ReviewReason) => void;
  onSaveDefinition: (row: GlossaryRow, gloss: string) => void;
  onRestored: (patch: GlossaryRowPatch | null) => Promise<void>;
  onReload: (term: string) => void;
};

const STATUS_CHOICES: readonly { value: GlossaryStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: capitalize(STATE_WORD.draft) },
  { value: "unchecked", label: "Live, never checked" },
  { value: "approved", label: capitalize(STATE_WORD.approved) },
];

export function TermsWorkspace(props: TermsWorkspaceProps) {
  const { paneId, allGroups, groups, totals, counts, totalRows, filters, onSearch, onStatus, searchRef, category, onToggleCategory, onCloseCategory, next, canAdmin, canDefine, pendingCount, nothingTranslatedYet, locked, onContinue, onOpenRuns, actions, activity, notice, onDismissNotice, hasUnsaved } = props;
  const listRef = useRef<HTMLElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const searching = filters.search.trim().length > 0;
  const open = searching ? null : groups.find((group) => group.category.id === category) ?? null;
  // An open category that the status filter empties still names itself in the pane.
  const openCategory = searching ? null : allGroups.find((group) => group.category.id === category) ?? null;
  useScrollToDetail(paneRef, category);
  const headingId = `${paneId}-heading`;
  const filterCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const openLeft = openCategory ? (totals[openCategory.category.id]?.draft ?? 0) + (totals[openCategory.category.id]?.unchecked ?? 0) : 0;

  const backToList = () => {
    listRef.current?.scrollIntoView({ block: "start" });
    listRef.current?.querySelector<HTMLElement>(`[data-category="${category ?? ""}"]`)?.focus();
  };

  const groupProps = (group: GlossaryGroup) => ({
    group,
    editDrafts: props.editDrafts,
    totals: totals[group.category.id] ?? { total: group.rows.length, draft: group.draftCount, unchecked: group.uncheckedCount },
    statusFilter: filters.status,
    disabled: props.busy,
    writingTerm: props.writingTerm,
    glosses: props.glosses,
    usages: props.usages,
    canDefine,
    onApproveAll: () => props.onApproveAll(group),
    onConfirmAll: () => props.onConfirmAll(group),
    onApprove: props.onApprove,
    onConfirm: props.onConfirm,
    onSave: props.onSave,
    onSaveAndApprove: props.onSaveAndApprove,
    onSaveDefinition: props.onSaveDefinition,
    onRestored: props.onRestored,
    onReload: props.onReload,
    rowNotice: props.rowNotice,
  });

  const statusChoices = STATUS_CHOICES.map((choice) => ({
    ...choice,
    count: choice.value === "draft" ? counts.drafts : choice.value === "unchecked" ? counts.unchecked : choice.value === "approved" ? counts.approved : undefined,
  }));
  const paneShown = searching || openCategory !== null;
  const dockNotice = paneShown ? notice : null;

  return (
    <div className="space-y-5">
      <TermsOverview
        counts={counts}
        next={next}
        canAdmin={canAdmin}
        pendingCount={pendingCount}
        nothingTranslatedYet={nothingTranslatedYet}
        locked={locked}
        onContinue={onContinue}
        onOpenRuns={onOpenRuns}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
        <section ref={listRef} aria-labelledby={`${paneId}-list-heading`} className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-3">
            <h3 id={`${paneId}-list-heading`} className="type-meta-label theme-text-muted">Categories</h3>
            <div className="flex items-center gap-2">
              <p className="theme-text-muted text-xs tabular-nums">{count(totalRows, "term")}</p>
              {actions}
            </div>
          </div>
          {activity && !paneShown ? <EditorStatusPill tone="info" loading live>{activity}</EditorStatusPill> : null}
          {paneShown ? null : <ResultNotice notice={notice} onDismiss={onDismissNotice} />}
          <SearchField ref={searchRef} label="Search words" value={filters.search} onChange={onSearch} placeholder="Search terms or translations" description="Matches the English term or its translation, in every category. Interface text shares this search." />
          <ChoiceGrid label="Status" choices={statusChoices} value={filters.status} onChange={onStatus} />
          {searching || filters.status !== "all" ? (
            <p className="theme-text-muted text-xs" aria-live="polite">
              {filterCount === 0 ? "No term matches." : `${count(filterCount, "term")} ${searching ? "match" : "shown"}${filters.status !== "all" ? `, ${STATUS_CHOICES.find((choice) => choice.value === filters.status)?.label.toLowerCase()} only` : ""}.`}
              {" "}
              <Button type="button" variant="link" size="auto" className="text-xs" onClick={() => { onSearch(""); onStatus("all"); }}>Show everything</Button>
            </p>
          ) : null}
          {allGroups.length === 0 ? null : (
            <ul aria-label="Glossary categories" className="theme-dev-link-list -mx-2.5">
              {allGroups.map((group) => {
                const id = group.category.id;
                const categoryTotals = totals[id] ?? { total: group.rows.length, draft: group.draftCount, unchecked: group.uncheckedCount };
                const openHere = standingLabel({ drafts: categoryTotals.draft, unchecked: categoryTotals.unchecked });
                const standing = openHere ? `${openHere} · ${count(categoryTotals.total, "term")}` : count(categoryTotals.total, "term");
                const current = !searching && category === id;
                const matches = groups.find((entry) => entry.category.id === id)?.rows.length ?? 0;
                const left = categoryTotals.draft + categoryTotals.unchecked;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      data-category={id}
                      aria-expanded={current}
                      aria-controls={paneId}
                      aria-label={`${group.category.label}: ${standing}`}
                      onClick={() => onToggleCategory(id)}
                      className={cn("theme-dev-link-row flex w-full min-w-0 items-center gap-3 rounded-control px-2.5 py-2.5 text-left transition-colors", current && "theme-dev-link-lead")}
                    >
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="theme-text-primary min-w-0 text-sm font-medium">{group.category.label}</span>
                          <span className="theme-dev-link-count shrink-0 text-xs tabular-nums" data-zero={left === 0 || undefined}>
                            {left === 0 ? <Icon icon="lucide:check" size={13} className="text-[color:var(--theme-success-text)]" /> : `${left} left`}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="flex h-1 w-full overflow-hidden rounded-full theme-progress-track">
                            <span className="block h-full bg-[var(--theme-accent)]" style={{ width: `${reviewedShare(categoryTotals)}%` }} />
                          </span>
                          {searching || filters.status !== "all" ? (
                            <span className="theme-text-faint shrink-0 text-xs tabular-nums">{matches} shown</span>
                          ) : (
                            <span className="theme-text-faint shrink-0 text-xs tabular-nums">{categoryTotals.total}</span>
                          )}
                        </span>
                      </span>
                      <Icon icon={current ? "lucide:chevron-down" : "lucide:chevron-right"} size={14} className="theme-dev-link-row-chevron shrink-0 lg:hidden" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {canDefine ? <p className="theme-text-muted text-xs"><span>Click a definition to edit it.</span> Definitions are English and shared by every language.</p> : null}
          <p className="theme-text-muted text-xs [@media(pointer:coarse)]:hidden">In a translation, Enter saves an edit as a draft; Ctrl+Enter (Command+Enter on a Mac) runs the row&apos;s main action.</p>
        </section>

        <section
          ref={paneRef}
          id={paneId}
          aria-label={searching ? "Matching terms" : openCategory ? `Terms: ${openCategory.category.label}` : "Terms"}
          className={cn("scroll-mt-24", !paneShown && "hidden lg:block")}
        >
          {searching ? (
            <EditorPanel className="overflow-visible">
              <header className="theme-portal-rule space-y-2 border-b px-4 py-3.5 sm:px-5">
                <BackToList onBack={backToList} />
                <h3 id={headingId} tabIndex={-1} className="theme-accent-heading text-lg font-semibold leading-tight outline-none">
                  Matches for “{filters.search.trim()}”
                </h3>
                <p className="theme-text-muted text-sm">{filterCount === 0 ? "Nothing matches in any category." : `${count(filterCount, "term")} in ${count(groups.length, "category", "categories")}. Each category keeps its own bulk actions.`}</p>
              </header>
              {groups.length === 0 ? (
                <div className="space-y-2 px-4 py-6 sm:px-5">
                  <p className="theme-text-secondary text-sm">{filters.status === "all" ? "Try another word, or search the translation instead of the English." : "Try another word, or show every state."}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => onSearch("")}>Clear the search</Button>
                    {filters.status !== "all" ? <Button type="button" variant="ghost" size="sm" onClick={() => onStatus("all")}>Show All</Button> : null}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[var(--theme-border-subtle)]">
                  {groups.map((group) => <GlossaryGroupSection key={group.category.id} headingLevel="h4" headingId={`${paneId}-${group.category.id}`} {...groupProps(group)} />)}
                </div>
              )}
              <TermsDock activity={activity} notice={dockNotice} onDismissNotice={onDismissNotice} hasUnsaved={hasUnsaved} />
            </EditorPanel>
          ) : openCategory ? (
            <EditorPanel className="overflow-visible">
              {open ? (
                <GlossaryGroupSection
                  headingId={headingId}
                  lead={<BackToList onBack={backToList}><Button type="button" variant="ghost" size="sm" className="-mr-2" onClick={onCloseCategory}>Close</Button></BackToList>}
                  {...groupProps(open)}
                />
              ) : (
                <div className="space-y-3 px-4 py-5 sm:px-5">
                  <BackToList onBack={backToList} />
                  <h3 id={headingId} tabIndex={-1} className="theme-accent-heading text-lg font-semibold outline-none">{openCategory.category.label}</h3>
                  <p className="theme-text-secondary text-sm">
                    No term in this category is {STATUS_CHOICES.find((choice) => choice.value === filters.status)?.label.toLowerCase()}.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => onStatus("all")}>Show All</Button>
                </div>
              )}
              <TermsDock
                activity={activity}
                notice={dockNotice}
                onDismissNotice={onDismissNotice}
                hasUnsaved={hasUnsaved}
                next={openLeft === 0 && next && next.id !== openCategory.category.id ? next : null}
                onContinue={onContinue}
                locked={locked}
              />
            </EditorPanel>
          ) : (
            <div className="theme-text-muted rounded-card border border-dashed border-[color:var(--editor-panel-border)] px-5 py-8 text-sm">
              {allGroups.length === 0 ? (
                "Terms appear here once the language has any."
              ) : (
                <>
                  <p className="theme-text-secondary">Open a category to review its terms here.</p>
                  <p className="mt-1">
                    Or press <span className="theme-text-secondary">Continue reviewing</span> to open the next one with work left
                    <span className="[@media(pointer:coarse)]:hidden">, and <kbd className="theme-dev-kbd">/</kbd> to search every category</span>.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TermsDock({ activity, notice, onDismissNotice, hasUnsaved, next = null, onContinue, locked = false }: {
  activity: string | null;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
  hasUnsaved: boolean;
  next?: NextCategory | null;
  onContinue?: (id: string) => void;
  locked?: boolean;
}) {
  if (!activity && !notice && !hasUnsaved && !next) return null;
  return (
    <PaneDock label="Review">
      <ResultNotice notice={notice} onDismiss={onDismissNotice} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {activity ? <EditorStatusPill tone="info" loading live>{activity}</EditorStatusPill> : null}
          {hasUnsaved ? (
            <span className="theme-text-muted inline-flex items-center gap-1.5 text-xs">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--theme-accent)]" />
              Unsaved wording in this language. Each row saves on its own.
            </span>
          ) : null}
        </div>
        {next && onContinue ? (
          <Button type="button" variant="accent" size="sm" disabled={locked} onClick={() => onContinue(next.id)}>
            Continue with {next.label}
            <span className="tabular-nums opacity-80">{next.left} left</span>
            <Icon icon="lucide:arrow-right" size={14} />
          </Button>
        ) : null}
      </div>
    </PaneDock>
  );
}
