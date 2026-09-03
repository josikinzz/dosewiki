"use client";

import { useEffect, useRef } from "react";

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
} from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";

import { AboutEditorTab } from "../about/AboutEditorTab";
import { WritingEditor } from "./WritingEditor";
import type { WritingKind } from "./writingEditorModel";
import { useWritingWorkbenchController } from "./useWritingWorkbenchController";

const ABOUT_ENTRY_ID = "about";

const KIND_OPTIONS: { value: WritingKind; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "blog", label: "Blog" },
];

const KIND_DESCRIPTION: Record<WritingKind, string> = {
  article: "Articles published to /articles, written in Markdown. Drafts stay off the public site entirely.",
  blog: "Posts published to /blog on dose.wiki. Cover image and teaser lead the index card.",
};

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
 * and a Markdown editor with the same preview renderer the public page uses.
 *
 * The filter lives in the URL (`/dev/writing?kind=blog`) so a reload keeps it.
 * Its writes go through native history, as the replications gallery's do: Next
 * syncs `useSearchParams` from its patched `replaceState` (the `null` state
 * matters; see `writeBrowseUrl` there), and no RSC round trip happens.
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
    isLoadingRow,
    listError,
    startNew,
    selectKind,
    selectPinned,
    selectRow,
  } = controller;

  // The kind the URL currently says. Only a change writes: the address the
  // editor arrived on (`/dev/about`, `/dev/blog/<slug>`) is left alone.
  const urlKindRef = useRef(routeKind);
  useEffect(() => {
    if (kind === urlKindRef.current) return;
    urlKindRef.current = kind;
    window.history.replaceState(
      null,
      "",
      viewToPath({
        type: "dev",
        tab: "writing",
        slug: selectedSlug ?? undefined,
        filter: kind === "article" ? undefined : kind,
      }),
    );
  }, [kind, selectedSlug]);

  if (entries === null) {
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <StateCard
          icon="lucide:pen-line"
          tone="accent"
          loading
          align="center"
          title="Loading writing"
          description="Pulling the editor listing, drafts included."
        />
      </div>
    );
  }

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
              onChange={(value) => selectKind(value as WritingKind)}
              options={KIND_OPTIONS}
            />
            <EditorStatusPill tone="neutral">
              {`${kindEntries.length} ${kindEntries.length === 1 ? "entry" : "entries"}`}
            </EditorStatusPill>
            <Button type="button" variant="accent" size="sm" onClick={startNew}>
              <Icon icon="lucide:plus" size={15} />
              New
            </Button>
          </div>
        }
      >
        {listError ? (
          <EditorNotice notice={{ tone: "danger", title: "List unavailable", message: listError }} />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div role="group" aria-label="Entries" className="space-y-2">
            <EditorListItem
              active={selection.type === "pinned"}
              title="About"
              subtitle="The /about page"
              badge={<EditorStatusPill tone="info">Pinned</EditorStatusPill>}
              onSelect={selectPinned}
            />

            {selection.type === "new" ? (
              <EditorListItem
                active
                title={draft.title.trim() || "Untitled"}
                subtitle="New, unsaved"
                badge={<EditorStatusPill tone="warning">New</EditorStatusPill>}
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
                  <EditorStatusPill tone={entry.status === "draft" ? "warning" : "success"}>
                    {entry.status === "draft" ? "Draft" : "Live"}
                  </EditorStatusPill>
                }
                onSelect={() => selectRow(entry.slug)}
              />
            ))}

            {kindEntries.length === 0 ? (
              <p className="theme-text-faint px-1 text-sm">Nothing written here yet.</p>
            ) : null}
          </div>

          <div className="space-y-6">
            {selection.type === "pinned" ? (
              <AboutEditorTab
                availableProfiles={contributorProfiles}
                profilesLoading={profilesLoading}
                canApprove={canApprove}
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
