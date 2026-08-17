"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorListItem,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
} from "@/features/dev/components";

import { WritingEditor } from "./WritingEditor";
import type { WritingKind } from "./writingEditorModel";
import { useWritingWorkbenchController } from "./useWritingWorkbenchController";

/** A pinned rail entry that owns the whole right pane when selected. */
export interface WritingPinnedEntry {
  id: string;
  title: string;
  subtitle: string;
  render: () => ReactNode;
}

interface WritingWorkbenchProps {
  kind: WritingKind;
  heading: string;
  description: string;
  /** Blog posts lead with a cover image and a teaser; articles do not. */
  emphasiseCover?: boolean;
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading?: boolean;
  /** Rendered above the list, always first. Used by Writing for About. */
  pinnedEntry?: WritingPinnedEntry;
  /** Deep-linked selection: `/dev/writing/<slug>`, or the pinned entry's id. */
  initialSelection?: string;
}

/**
 * The shared Writing/Blog workbench: a rail of the rows of one kind, and a
 * Markdown editor with the same preview renderer used by the public page.
 */
export function WritingWorkbench({
  kind,
  heading,
  description,
  emphasiseCover = false,
  contributorProfiles,
  profilesLoading = false,
  pinnedEntry,
  initialSelection,
}: WritingWorkbenchProps) {
  const controller = useWritingWorkbenchController({
    kind,
    pinnedEntryId: pinnedEntry?.id,
    initialSelection,
  });
  const {
    entries,
    selection,
    kindEntries,
    selectedSlug,
    draft,
    isLoadingRow,
    listError,
    startNew,
    selectPinned,
    selectRow,
  } = controller;

  if (entries === null) {
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <StateCard
          icon="lucide:pen-line"
          tone="accent"
          loading
          align="center"
          title={`Loading ${heading.toLowerCase()}`}
          description="Pulling the editor listing, drafts included."
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <EditorSection
        icon="lucide:pen-line"
        title={heading}
        description={description}
        actions={
          <div className="flex items-center gap-2">
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
          <div className="space-y-2">
            {pinnedEntry ? (
              <EditorListItem
                active={selection.type === "pinned"}
                title={pinnedEntry.title}
                subtitle={pinnedEntry.subtitle}
                badge={<EditorStatusPill tone="info">Pinned</EditorStatusPill>}
                onSelect={selectPinned}
              />
            ) : null}

            {selection.type === "new" ? (
              <EditorListItem
                active
                title={draft.title.trim() || "Untitled"}
                subtitle="New — unsaved"
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
            {selection.type === "pinned" && pinnedEntry ? (
              pinnedEntry.render()
            ) : isLoadingRow ? (
              <p className="theme-text-faint text-sm">Loading…</p>
            ) : (
              <WritingEditor
                kind={kind}
                emphasiseCover={emphasiseCover}
                contributorProfiles={contributorProfiles}
                profilesLoading={profilesLoading}
                controller={controller}
              />
            )}
          </div>
        </div>
      </EditorSection>
    </div>
  );
}
