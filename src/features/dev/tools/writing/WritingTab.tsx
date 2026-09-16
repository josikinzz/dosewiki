"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorListItem,
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  useDirtyGuard,
  useScrollToDetail,
} from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";

import { AboutEditorTab } from "../about/AboutEditorTab";
import { WritingEditor } from "./WritingEditor";
import type { WritingKind } from "./writingEditorModel";
import {
  useWritingWorkbenchController,
  type WritingSelection,
} from "./useWritingWorkbenchController";

const ABOUT_ENTRY_ID = "about";
/** The rail sits beside the editor from `xl:` up; below that it stacks above it. */
const STACKED_BELOW_XL_QUERY = "(max-width: 1279px)";

const KIND_OPTIONS: { value: WritingKind; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "blog", label: "Blog" },
];

const KIND_DESCRIPTION: Record<WritingKind, string> = {
  article: "Articles published to /articles, preserving Markdown or VCode. Unpublished rows stay off the public site.",
  blog: "Posts published to /blog on dose.wiki. Cover image and teaser lead the index card.",
};

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
  /** Admin: the pinned About entry and every writing row save directly; without it About is submitted as a proposal and rows are read-only for saving. */
  canApprove: boolean;
}

/**
 * The Writing tab: one rail of the site's written pages with a kind filter
 * (articles under `/articles`, blog posts under `/blog`), About pinned first,
 * and one format-preserving editor shared with the public-page contextual panel.
 *
 * The kind filter and the open record live in the URL (`/dev/writing?kind=blog`,
 * `/dev/writing/<slug>`, `/dev/writing/about`) so a reload keeps them and a
 * record can be linked. Its writes go through native history, as the
 * replications gallery's do: Next syncs `useSearchParams` from its patched
 * `replaceState` (the `null` state matters; see `writeBrowseUrl` there), and no
 * RSC round trip happens.
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
    isLoadingRow,
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
    window.history.replaceState(null, "", path);
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
  });
  const unsavedPill = <EditorStatusPill tone="warning">Unsaved</EditorStatusPill>;

  // Below the xl split the entries rail stacks above the editor so the editor
  // keeps its full width at 1024. Pinned and new selections count too: About
  // and a fresh draft both open an editor.
  const detailRef = useRef<HTMLDivElement | null>(null);
  const selectionKey = selection.type === "row" ? `row:${selection.slug}` : selection.type;
  useScrollToDetail(detailRef, selectionKey, STACKED_BELOW_XL_QUERY);


  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <EditorSection
        icon="lucide:pen-line"
        title="Writing"
        description={KIND_DESCRIPTION[kind]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <EditorSegmentedControl
              label="Kind"
              value={kind}
              onChange={(value) => {
                const next = value as WritingKind;
                if (next === kind) return;
                // Only an open row is dropped by the filter; a new draft and
                // About both stay put, so neither needs to ask.
                if (selection.type === "row") guard(() => selectKind(next));
                else selectKind(next);
              }}
              options={KIND_OPTIONS}
            />
            <EditorStatusPill tone="neutral">
              {`${kindEntries.length} ${kindEntries.length === 1 ? "entry" : "entries"}`}
            </EditorStatusPill>
            <Button type="button" variant="accent" size="sm" onClick={() => guard(startNew)}>
              <Icon icon="lucide:plus" size={15} />
              New
            </Button>
          </div>
        }
      >
        {dialog}
        {listError ? (
          <EditorNotice notice={{ tone: "danger", title: "List unavailable", message: listError }} />
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div role="group" aria-label="Entries" className="space-y-2">
            <EditorListItem
              active={pinned}
              title="About"
              subtitle="The /about page"
              badge={pinned && aboutDirty ? unsavedPill : <EditorStatusPill tone="info">Pinned</EditorStatusPill>}
              onSelect={() => {
                if (!pinned) guard(selectPinned);
              }}
            />
            {entries === null ? (
              <StateCard loading compact title="Loading writing list" />
            ) : null}

            {selection.type === "new" ? (
              <EditorListItem
                active
                title={draft.title.trim() || "Untitled"}
                subtitle="New, unsaved"
                badge={isDirty ? unsavedPill : <EditorStatusPill tone="warning">New</EditorStatusPill>}
                onSelect={() => undefined}
              />
            ) : null}

            {kindEntries.map((entry) => (
              <EditorListItem
                key={entry.slug}
                active={selectedSlug === entry.slug}
                title={entry.title}
                subtitle={entry.slug}
                badge={
                  selectedSlug === entry.slug && isDirty ? (
                    unsavedPill
                  ) : (
                    <EditorStatusPill tone={entry.status === "draft" ? "warning" : "success"}>
                      {entry.status === "draft" ? "Draft" : "Live"}
                    </EditorStatusPill>
                  )
                }
                onSelect={() => {
                  if (selectedSlug !== entry.slug) guard(() => selectRow(entry.slug));
                }}
              />
            ))}

            {entries !== null && kindEntries.length === 0 ? (
              <p className="theme-text-faint px-1 text-sm">Nothing written here yet.</p>
            ) : null}
          </div>

          <div ref={detailRef} className="scroll-mt-6 space-y-6">
            {pinned ? (
              <AboutEditorTab
                availableProfiles={contributorProfiles}
                profilesLoading={profilesLoading}
                canApprove={canApprove}
                onDirtyChange={setAboutDirty}
                onCanDiscardChange={setAboutCanDiscard}
              />
            ) : isLoadingRow ? (
              <p className="theme-text-faint text-sm">Loading…</p>
            ) : (
              <WritingEditor
                contributorProfiles={contributorProfiles}
                profilesLoading={profilesLoading}
                controller={controller}
                canApprove={canApprove}
              />
            )}
          </div>
        </div>
      </EditorSection>
    </div>
  );
}
