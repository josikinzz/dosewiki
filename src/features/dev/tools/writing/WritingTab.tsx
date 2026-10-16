"use client";

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
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
const FILTER_FROM = 8;

const SEARCH_SHORTCUTS = [{ keys: "/", label: "Filter the Writing list" }] as const;
const ROW_SHORTCUTS = [{ keys: "j / k", label: "Next or previous page in the Writing list" }] as const;

function typingOrDialog(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return true;
  return Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
}

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
  initialSlug?: string;
  initialKind?: string;
  canApprove: boolean;
}

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
  const { canSave, saveUnpublished, submitForReview, discard: discardDraft } = controller;
  const shellCanSave = !pinned && canSave && isDirty && (canApprove || !controller.loadedRow || draft.slug.trim() === controller.loadedRow.slug);
  useUnsavedWork({
    id: "writing",
    label: `Writing: ${openTitle}`,
    dirty: unsaved,
    saveLabel: canApprove ? "Save as unpublished" : "Submit for review",
    ...(shellCanSave && canApprove && controller.canSaveUnpublished
      ? { kind: "save-unpublished" as const, saveDraft: async () => {
          if (!(await saveUnpublished())) throw new Error(`${openTitle} was not saved. The reason is shown in the editor.`);
        } }
      : shellCanSave && !canApprove
        ? { kind: "submit-proposal" as const, submit: async () => {
            if (!(await submitForReview())) throw new Error(`${openTitle} was not submitted. The reason is shown in the editor.`);
          } }
        : { kind: "discard-only" as const, because: pinned
            ? "Finish the About change from its editor."
            : canApprove && !controller.canSaveUnpublished
              ? "This change would go live. Publish it from the tool; leaving here never publishes."
              : "Finish or confirm the pending Writing action from the tool." }),
    discard: pinned ? () => {} : discardDraft,
  });

  const listRef = useRef<HTMLElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const paneTitleRef = useRef<HTMLHeadingElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const selectionKey = selection.type === "row" ? `row:${selection.slug}` : selection.type;
  useScrollToDetail(paneRef, selectionKey);
  const focusPaneOnOpen = useRef(false);
  const titleReady = selection.type !== "row" || !controller.isLoadingRow;
  useEffect(() => {
    if (!focusPaneOnOpen.current || !titleReady) return;
    focusPaneOnOpen.current = false;
    paneTitleRef.current?.focus({ preventScroll: true });
  }, [selectionKey, titleReady]);
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
      <DevToolSection
        tool="writing"
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
      </DevToolSection>
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
      <p className="flex items-center justify-between gap-3">
        <span className="type-meta-label theme-text-muted">{label}</span>
        <span className="theme-text-faint text-xs tabular-nums">{entries.length}</span>
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

