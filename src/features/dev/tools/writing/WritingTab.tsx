"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorSection,
  EditorSegmentedControl,
  LoadErrorState,
  Notice,
  useDevShortcuts,
  useDirtyGuard,
  useScrollToDetail,
  useUnsavedWork,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { viewToPath } from "@/utils/routing";

import { AboutEditorTab } from "../about/AboutEditorTab";
import { LINK_LIST_CLASS, RowSkeletons } from "../home/homeParts";
import {
  formatPublicationDate,
  groupWritingEntries,
  writingAddress,
  writingEntryMatches,
  writingKindNoun,
  type WritingKind,
  type WritingListEntry,
} from "./writingEditorModel";
import { WritingPane } from "./WritingPane";
import {
  useWritingWorkbenchController,
  type WritingSelection,
} from "./useWritingWorkbenchController";

const ABOUT_ENTRY_ID = "about";
/** A list this long gets a filter box. */
const FILTER_FROM = 8;

const SEARCH_SHORTCUTS = [{ keys: "/", label: "Filter the Writing list" }] as const;
const ROW_SHORTCUTS = [{ keys: "j / k", label: "Next or previous page in the Writing list" }] as const;

/** Whether a key press belongs to a field or an open dialog rather than the list. */
function typingOrDialog(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return true;
  return Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
}

/** The address of what is open: the pinned entry, a row, or a fresh draft under the kind filter. */
function writingPath(selection: WritingSelection, kind: WritingKind): string {
  return viewToPath({
    type: "dev",
    tab: "writing",
    slug:
      selection.type === "pinned"
        ? ABOUT_ENTRY_ID
        : selection.type === "row"
          ? selection.slug
          : undefined,
    filter: kind === "article" ? undefined : kind,
  });
}

interface WritingTabProps {
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading?: boolean;
  /** `/dev/writing/<slug>`, `/dev/blog/<slug>`, or `about` from the retired `/dev/about` link. */
  initialSlug?: string;
  /** The route's `?kind=` value, validated by the registry; anything else opens on articles. */
  initialKind?: string;
  /** Admin: the pinned About entry and every writing row save directly; without it both are submitted for review as proposals. */
  canApprove: boolean;
}

/**
 * The Writing tab: the site's written pages in an editor workspace. The list
 * column holds the pinned About page, the kind filter (articles under
 * `/articles`, blog posts under `/blog`) and the pages of that kind, drafts
 * first; the open page docks on the right with its fields, a live preview and
 * a sticky save dock.
 *
 * The kind filter and the open record live in the URL (`/dev/writing?kind=blog`,
 * `/dev/writing/<slug>`, `/dev/writing/about`) so a reload keeps them and a
 * record can be linked. The address is written with
 * `replaceState(window.history.state, ...)`, which keeps Next's own state so
 * no navigation or scroll happens.
 *
 * About is here rather than in a tab of its own because it is one page of
 * writing among the others; it belongs to neither kind, so it stays pinned
 * whatever the filter says. It saves the way its siblings do, through one
 * immediate `POST /api/dev/about`, and owns its own document session; the
 * shell's commit panel never sees it.
 */
export function WritingTab({
  contributorProfiles,
  profilesLoading = false,
  initialSlug,
  initialKind,
  canApprove,
}: WritingTabProps) {
  const routeKind: WritingKind = initialKind === "blog" ? "blog" : "article";
  const controller = useWritingWorkbenchController({
    initialKind: routeKind,
    pinnedEntryId: ABOUT_ENTRY_ID,
    initialSelection: initialSlug,
  });
  const {
    kind,
    entries,
    selection,
    kindEntries,
    selectedSlug,
    draft,
    isDirty,
    listError,
    startNew,
    selectKind,
    selectPinned,
    selectRow,
  } = controller;

  // The address the URL currently says. Only a change writes: the address the
  // editor arrived on (`/dev/about`, `/dev/blog/<slug>`) is left alone, so the
  // first run records what that address opened without rewriting it.
  const path = writingPath(selection, kind);
  const urlPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (urlPathRef.current === null) {
      urlPathRef.current = path;
      return;
    }
    if (path === urlPathRef.current) return;
    urlPathRef.current = path;
    window.history.replaceState(window.history.state, "", path);
  }, [path]);

  // About keeps its own draft; leaving it drops that draft the way leaving a
  // row drops the writing draft, so both feed the one discard guard.
  const [aboutDirty, setAboutDirty] = useState(false);
  const [aboutCanDiscard, setAboutCanDiscard] = useState(true);
  const pinned = selection.type === "pinned";
  const unsaved = pinned ? aboutDirty : isDirty;
  const openTitle = pinned ? "About" : draft.title.trim() || "Untitled";
  const { guard, dialog } = useDirtyGuard(unsaved, {
    title: `Discard changes to ${openTitle}?`,
    description: "Nothing here is saved until you save it. Leaving now loses what you changed.",
    canDiscard: pinned ? aboutCanDiscard : !controller.uncertain && controller.saveState !== "saving",
    warnOnUnload: false,
  });
  // The shell asks before a rail click, Leave or sign-out drops the open
  // draft. Its Save is the editor's own save, offered only when that button
  // would be enabled. For an admin that is only an unpublished save: a record
  // that is or would become live (publishing, or unpublishing a live page) is
  // published from the editor. For an editor it is Submit for review, which
  // never goes live on its own. About keeps its own save, so the shell only
  // discards it (unmounting drops that draft).
  const { canSave, save: saveDraft, submitForReview, discard: discardDraft, baseline } = controller;
  const shellCanSave = !pinned && canSave && isDirty && (canApprove || !controller.loadedRow || draft.slug.trim() === controller.loadedRow.slug);
  useUnsavedWork({
    id: "writing",
    label: `Writing: ${openTitle}`,
    dirty: unsaved,
    saveLabel: canApprove ? "Save as unpublished" : "Submit for review",
    publishesLive: !pinned && canApprove && (draft.status === "published" || baseline.status === "published"),
    save: shellCanSave
      ? async () => {
          if (!(await (canApprove ? saveDraft(draft.status) : submitForReview()))) {
            throw new Error(`${openTitle} was not ${canApprove ? "saved" : "submitted"}. The reason is shown in the editor.`);
          }
        }
      : undefined,
    discard: pinned ? () => {} : discardDraft,
  });

  const listRef = useRef<HTMLElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const paneTitleRef = useRef<HTMLHeadingElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const selectionKey = selection.type === "row" ? `row:${selection.slug}` : selection.type;
  useScrollToDetail(paneRef, selectionKey);
  // A pick names the open page for keyboard and screen reader users once it
  // is in the page; an effect, so a click into a field right after keeps focus.
  const focusPaneOnOpen = useRef(false);
  const titleReady = selection.type !== "row" || !controller.isLoadingRow;
  useEffect(() => {
    if (!focusPaneOnOpen.current || !titleReady) return;
    focusPaneOnOpen.current = false;
    paneTitleRef.current?.focus({ preventScroll: true });
  }, [selectionKey, titleReady]);
  // A deep link (`/dev/writing/<slug>`, `/dev/about`) on a phone lands on the
  // list, far above the pane: once the page it names is loaded, scroll the pane
  // in and name it, once.
  const deepLinkPending = useRef(Boolean(initialSlug));
  useEffect(() => {
    if (!deepLinkPending.current || !titleReady) return;
    if (selection.type === "row" && !controller.loadedRow) return;
    deepLinkPending.current = false;
    if (typeof window.matchMedia !== "function" || !window.matchMedia("(max-width: 1023px)").matches) return;
    const frame = requestAnimationFrame(() => {
      paneRef.current?.scrollIntoView({ block: "start" });
      paneTitleRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [titleReady, selection.type, controller.loadedRow]);
  const open = (proceed: () => void) =>
    guard(() => {
      focusPaneOnOpen.current = true;
      proceed();
    });

  const showFilter = kindEntries.length >= FILTER_FROM;
  useDevShortcuts(SEARCH_SHORTCUTS, showFilter);
  useEffect(() => {
    if (!showFilter) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || typingOrDialog(event)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showFilter]);

  // j / k walk the list's rows by focus; Enter opens the focused one.
  useDevShortcuts(ROW_SHORTCUTS);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key !== "j" && event.key !== "k") || event.metaKey || event.ctrlKey || event.altKey || typingOrDialog(event)) return;
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-entry-row]") ?? []);
      if (rows.length === 0) return;
      event.preventDefault();
      const focused = rows.indexOf(document.activeElement as HTMLElement);
      const from = focused >= 0 ? focused : rows.findIndex((row) => row.getAttribute("aria-current") === "true");
      const next = event.key === "j" ? Math.min(rows.length - 1, from + 1) : Math.max(0, from < 0 ? 0 : from - 1);
      rows[next]?.focus();
      rows[next]?.scrollIntoView?.({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = showFilter ? kindEntries.filter((entry) => writingEntryMatches(entry, query)) : kindEntries;
  const { drafts, live } = groupWritingEntries(shown);
  const articleCount = (entries ?? []).filter((entry) => entry.kind !== "blog").length;
  const blogCount = (entries ?? []).filter((entry) => entry.kind === "blog").length;
  const noun = writingKindNoun(kind);

  const backToList = () => {
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
  };

  const rowProps = (entry: WritingListEntry) => ({
    entry,
    isOpen: selectedSlug === entry.slug,
    isDirty: selectedSlug === entry.slug && isDirty,
    onOpen: () => {
      if (selectedSlug === entry.slug) paneTitleRef.current?.focus();
      else open(() => selectRow(entry.slug));
    },
  });

  return (
    <div className="mx-auto w-full max-w-[100rem]">
      <EditorSection
        icon="lucide:pen-line"
        title="Writing"
        description="Articles, blog posts and the About page. Open one to edit it beside a live preview of the public page."
      >
        {dialog}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
          <section
            ref={listRef}
            aria-label="Writing list"
            className="scroll-mt-24 space-y-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1"
          >
            {controller.missingSlug ? (
              <Notice
                tone="warning"
                message={`Nothing is saved at “${controller.missingSlug}”. It may have been renamed or removed, so the About page opened instead.`}
                dismiss={controller.dismissMissing}
              />
            ) : null}

            <div role="group" aria-label="Entries" className="space-y-5">
              <div className="space-y-1.5">
                <p className="type-meta-label theme-text-muted">Pinned</p>
                <ul className={LINK_LIST_CLASS}>
                  <li>
                    <EntryButton
                      isOpen={pinned}
                      isDirty={pinned && aboutDirty}
                      title="About page"
                      icon="lucide:info"
                      meta={<span className="font-mono">/about</span>}
                      onOpen={() => (pinned ? paneTitleRef.current?.focus() : open(selectPinned))}
                    />
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <EditorSegmentedControl
                    label="Kind"
                    value={kind}
                    onChange={(value) => {
                      const next = value as WritingKind;
                      if (next === kind) return;
                      setQuery("");
                      // Only an open row is dropped by the filter; a new draft and
                      // About both stay put, so neither needs to ask.
                      if (selection.type === "row") guard(() => selectKind(next));
                      else selectKind(next);
                    }}
                    options={[
                      { value: "article", label: "Articles", badge: entries && !listError ? String(articleCount) : undefined },
                      { value: "blog", label: "Blog posts", badge: entries && !listError ? String(blogCount) : undefined },
                    ]}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => open(startNew)} disabled={controller.uncertain || controller.saveState === "saving"}>
                    <Icon icon="lucide:plus" size={15} />
                    {`New ${noun === "article" ? "article" : "post"}`}
                  </Button>
                </div>

                {showFilter ? (
                  <div className="relative">
                    <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      ref={searchRef}
                      type="search"
                      aria-label={`Filter ${noun === "article" ? "articles" : "blog posts"}`}
                      aria-keyshortcuts="/"
                      placeholder="Title, address or tag"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && query) {
                          event.preventDefault();
                          setQuery("");
                        }
                      }}
                      className="pl-9 pr-9"
                    />
                    {!query ? (
                      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden">
                        <kbd className="theme-dev-kbd">/</kbd>
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {listError ? (
                  <LoadErrorState
                    what={`the ${noun === "article" ? "articles" : "blog posts"}`}
                    message={listError}
                    onRetry={() => void controller.retryList()}
                    busy={controller.listLoading}
                  />
                ) : entries === null ? (
                  <RowSkeletons rows={3} label={`the ${noun === "article" ? "articles" : "blog posts"}`} />
                ) : null}

                {selection.type === "new" ? (
                  <ul className={LINK_LIST_CLASS} aria-label="New">
                    <li>
                      <EntryButton
                        isOpen
                        isDirty={isDirty}
                        title={draft.title.trim() || `Untitled ${noun}`}
                        icon="lucide:file-plus"
                        meta="New, not saved yet"
                        onOpen={() => paneTitleRef.current?.focus()}
                      />
                    </li>
                  </ul>
                ) : null}

                {entries !== null && !listError && kindEntries.length === 0 ? (
                  <div className="space-y-2">
                    <p className="theme-text-muted text-sm">
                      <span className="theme-text-secondary block font-medium">Nothing written here yet.</span>
                      {`No ${noun === "article" ? "articles" : "blog posts"} are saved, drafts included.`}
                    </p>
                    {selection.type !== "new" ? (
                      <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => open(startNew)}>
                        {`Write the first ${noun === "article" ? "article" : "post"}`}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {showFilter && query && shown.length === 0 ? (
                  <p className="theme-text-muted text-sm">
                    {`No ${noun === "article" ? "article" : "post"} matches “${query}”. `}
                    <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => setQuery("")}>
                      Clear the filter
                    </Button>
                  </p>
                ) : null}

                <EntryGroup label="Drafts" entries={drafts} rowProps={rowProps} />
                <EntryGroup label="Live" entries={live} rowProps={rowProps} />
              </div>
            </div>
          </section>

          <section ref={paneRef} aria-label="Editor" className="min-w-0 scroll-mt-24">
            {pinned ? (
              <AboutEditorTab
                availableProfiles={contributorProfiles}
                profilesLoading={profilesLoading}
                canApprove={canApprove}
                onDirtyChange={setAboutDirty}
                onCanDiscardChange={setAboutCanDiscard}
                titleRef={paneTitleRef}
                onBackToList={backToList}
              />
            ) : (
              <WritingPane
                // One pane per record, so view and dialog state never carry to another page.
                key={selection.type === "row" ? `row:${selection.slug}` : "new"}
                controller={controller}
                contributorProfiles={contributorProfiles}
                profilesLoading={profilesLoading}
                canApprove={canApprove}
                titleRef={paneTitleRef}
                onBackToList={backToList}
              />
            )}
          </section>
        </div>
      </EditorSection>
    </div>
  );
}

function EntryGroup({
  label,
  entries,
  rowProps,
}: {
  label: string;
  entries: WritingListEntry[];
  rowProps: (entry: WritingListEntry) => { entry: WritingListEntry; isOpen: boolean; isDirty: boolean; onOpen: () => void };
}) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="type-meta-label theme-text-muted">
        {label}
        <span className="theme-text-faint ml-2 tabular-nums">{entries.length}</span>
      </p>
      <ul className={LINK_LIST_CLASS} aria-label={`${label}, ${entries.length}`}>
        {entries.map((entry) => {
          const props = rowProps(entry);
          const date = formatPublicationDate(entry.publicationDate);
          return (
            <li key={entry.slug} data-writing-slug={entry.slug}>
              <EntryButton
                isOpen={props.isOpen}
                isDirty={props.isDirty}
                title={entry.title}
                meta={
                  <>
                    <span className="font-mono">{writingAddress(entry.kind, entry.slug)}</span>
                    <span className="sr-only">, </span>
                    <span className="block font-sans">{date ? `Dated ${date}` : "No date"}</span>
                  </>
                }
                onOpen={props.onOpen}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EntryButton({
  isOpen,
  isDirty,
  title,
  meta,
  icon,
  onOpen,
}: {
  isOpen: boolean;
  isDirty: boolean;
  title: string;
  meta: ReactNode;
  icon?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-entry-row
      aria-keyshortcuts="j k"
      aria-current={isOpen ? "true" : undefined}
      onClick={onOpen}
      className={cn(
        "theme-dev-link-row group flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2.5 text-left text-sm transition-colors motion-reduce:transition-none",
        isOpen && "theme-dev-link-lead",
      )}
    >
      {icon ? <Icon icon={icon} size={16} className={cn("shrink-0", isOpen ? "theme-icon-accent" : "theme-text-faint")} /> : null}
      <span className="min-w-0 flex-1">
        <span data-entry-title className="theme-text-primary line-clamp-2 break-words font-medium">{title}</span>
        <span className="sr-only">, </span>
        <span className="theme-text-faint mt-0.5 block min-w-0 text-xs [&>.font-mono]:block [&>.font-mono]:truncate">{meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs">
        <span className="sr-only">, </span>
        {isOpen ? (
          <>
            {isDirty ? <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" /> : null}
            <span className="text-dose-accent-strong font-medium">{isDirty ? "Editing, unsaved" : "Editing"}</span>
          </>
        ) : (
          <>
            <span className="theme-text-muted [@media(pointer:fine)]:sr-only">Edit</span>
            <Icon icon="lucide:chevron-right" size={16} className="theme-dev-link-row-chevron" />
          </>
        )}
      </span>
    </button>
  );
}

