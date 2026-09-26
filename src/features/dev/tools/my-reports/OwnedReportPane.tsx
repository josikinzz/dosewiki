"use client";

/**
 * The open report in My reports: a docked pane with one header (the report's
 * saved title, its live address, Close), the three content fields a member
 * may change, and a sticky save dock at the bottom that holds the result of
 * the last save, the unsaved line, and the actions. It mirrors the Inbox's
 * review pane, so the outcome of a save shows where the Save button is.
 */

import { useId, useState, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorField,
  EditorPanel,
  Notice,
  TagToken,
  type NoticeMessage,
} from "@/features/dev/components";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import { PortalReportTimelineEditor } from "../trip-report-portal/PortalReportTimelineEditor";
import type { OwnedReportRecord } from "./myReportsModel";

export type OpenReport = { record: OwnedReportRecord; draft: TripReportEditableFields };

export function OwnedReportPane({
  open,
  dirty,
  saving,
  saveKeyLabel,
  notice,
  onDismissNotice,
  onChange,
  onClose,
  onBackToList,
  onRevert,
  onSave,
  titleRef,
  saveLine,
}: {
  open: OpenReport;
  dirty: boolean;
  saving: boolean;
  /** The save key as this platform writes it ("⌘S", "Ctrl S"); shown on fine pointers only. */
  saveKeyLabel: string;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
  onChange: (draft: TripReportEditableFields) => void;
  onClose: () => void;
  onBackToList: () => void;
  onRevert: () => void;
  onSave: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
  /** The shell's save sentence, drawn in the dock beside Save (`saveLine: "in-tool"`). */
  saveLine: ReactNode;
}) {
  const { record, draft } = open;
  const headingId = useId();
  const liveHref = `/reports/${record.slug}`;

  function patch(next: Partial<TripReportEditableFields>) {
    onChange({ ...draft, ...next });
  }

  return (
    <EditorPanel className="overflow-visible" data-testid="my-report-editor" aria-labelledby={headingId} role="region">
      <header className="theme-portal-rule relative space-y-3 border-b px-4 py-3.5 sm:px-5">
        {/* One Close for both layouts, pinned to the corner; the rows it shares keep clear of it. */}
        <Button
          type="button"
          variant="iconGhost"
          size="icon"
          className={cn("absolute right-2 top-2 sm:right-3", TOUCH_ICON)}
          onClick={onClose}
          aria-label="Close editor"
          title="Close editor"
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
          id={headingId}
          ref={titleRef}
          tabIndex={-1}
          className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none lg:pr-12"
        >
          <span className="sr-only">Editing </span>
          {record.fields.title || "Untitled report"}
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
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
          <span aria-hidden className="theme-text-faint break-all font-mono text-xs">
            {liveHref}
          </span>
        </div>
        <p className="theme-text-muted flex items-start gap-2 text-sm">
          <Icon icon="lucide:lock" size={14} className="theme-text-faint mt-0.5 shrink-0" />
          <span>
            You can change the title, tags and body. The byline, attribution, subject details and substances are
            changed by an editor in Trip reports.
          </span>
        </p>
      </header>

      <div className="space-y-6 px-4 py-5 sm:px-5">
        <EditorField htmlFor="my-report-title" label="Title">
          <Input
            id="my-report-title"
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
            className="font-semibold"
          />
        </EditorField>

        <TagsField tags={draft.tags} onChange={(tags) => patch({ tags })} />

        <fieldset className="min-w-0 space-y-3">
          <legend className="theme-text-muted text-sm font-medium leading-5">Report body</legend>
          <p className="theme-text-faint -mt-1 text-xs">
            Introduction, the three timeline phases and the conclusion, in reading order. Empty parts are left out of
            the page.
          </p>
          <PortalReportTimelineEditor draft={draft} onChange={onChange} />
        </fieldset>
      </div>

      <footer
        aria-label="Save"
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      >
        {notice ? (
          <Notice {...notice} dismiss={onDismissNotice} className="text-sm" />
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={saving || !dirty}
            aria-busy={saving || undefined}
            aria-keyshortcuts="Meta+S Control+S"
            onClick={onSave}
          >
            {saving ? "Publishing" : "Save"}
            {/* The wrapper hides the cap on touch screens; the kbd class sets its own display. */}
            <span aria-hidden className="[@media(pointer:coarse)]:hidden">
              <kbd className="theme-dev-kbd !text-current opacity-70">{saveKeyLabel}</kbd>
            </span>
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={saving || !dirty} onClick={onRevert}>
            Discard edits
          </Button>
          <SaveState dirty={dirty} saving={saving} />
          <span className="min-w-0 sm:ml-auto">{saveLine}</span>
        </div>
      </footer>
    </EditorPanel>
  );
}

/** One quiet line beside the actions: what Save would do right now. */
function SaveState({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  let content: ReactNode;
  if (saving) {
    content = "Publishing your changes";
  } else if (dirty) {
    content = (
      <>
        <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
        Unsaved changes
      </>
    );
  } else {
    content = "No changes yet";
  }
  return (
    <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", dirty ? "theme-text-secondary" : "theme-text-faint")}>
      {content}
    </p>
  );
}

/**
 * Tags as removable tokens with an entry box. Enter adds the trimmed tag;
 * Backspace in an empty box removes the last one. The entry box grows to
 * fill the rest of the row, so most of the field is a place to type.
 */
function TagsField({ tags, onChange }: { tags: readonly string[]; onChange: (tags: string[]) => void }) {
  const [tagDraft, setTagDraft] = useState("");
  const labelId = useId();
  const hintId = useId();
  const inputId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className="space-y-2">
      <label id={labelId} htmlFor={inputId} className="theme-text-muted block text-sm font-medium leading-5">
        Tags
      </label>
      <div
        className="theme-replication-field theme-portal-rule flex min-h-10 flex-wrap items-center gap-1.5 rounded-control border p-1.5 [@media(pointer:coarse)]:min-h-11"
      >
        {tags.map((tag, index) => (
          <TagToken
            key={`${tag}-${index}`}
            label={tag}
            variant="compact"
            removeLabel={`Remove tag ${tag}`}
            onRemove={() => onChange(tags.filter((_, at) => at !== index))}
          />
        ))}
        <input
          id={inputId}
          aria-label="Add tag"
          aria-describedby={hintId}
          value={tagDraft}
          placeholder={tags.length === 0 ? "Add a tag" : "Add another"}
          enterKeyHint="done"
          className="theme-text-primary min-w-28 flex-1 bg-transparent px-1 py-0.5 text-[16px] outline-none md:text-sm [@media(pointer:coarse)]:min-h-8"
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && tagDraft.trim()) {
              event.preventDefault();
              const next = tagDraft.trim();
              // A tag already on the report is not added twice; the box clears either way.
              if (!tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) onChange([...tags, next]);
              setTagDraft("");
            } else if (event.key === "Backspace" && !tagDraft && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
        />
      </div>
      <p id={hintId} className="theme-text-faint text-xs">
        Enter adds a tag (a repeat is skipped). Backspace in an empty box removes the last one.
      </p>
    </div>
  );
}
