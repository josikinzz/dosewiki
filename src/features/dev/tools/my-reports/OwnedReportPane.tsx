"use client";

import { useId, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorField,
  EditorPanel,
  Notice,
  type NoticeMessage,
} from "@/features/dev/components";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import { PortalReportTimelineEditor } from "../trip-report-portal/PortalReportTimelineEditor";
import { ReportTagsField as TagsField } from "../trip-report-portal/ReportTagsField";
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
  saveKeyLabel: string;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
  onChange: (draft: TripReportEditableFields) => void;
  onClose: () => void;
  onBackToList: () => void;
  onRevert: () => void;
  onSave: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
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
