"use client";

/**
 * A published report's content form for the public correction panel
 * (`PublishedReport.editor.tsx`): the title, the trip's details, tags,
 * substances and the report body, with its review action in a sticky toolbar.
 * Attribution, ownership and removal stay in the Trip reports tool, whose
 * editing pane is `PortalReportPane`; both draw the same field groups.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorPanel, EditorStatusPill, EditorToolbar, Notice } from "@/features/dev/components";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import type { PortalContributorOption, PortalRow } from "./tripReportPortalModel";
import { PortalReportTimelineEditor } from "./PortalReportTimelineEditor";
import { SubstancesField, TripDetailsFields } from "./ReportFields";
import { ReportTagsField } from "./ReportTagsField";

export type EditorSaveRequest = {
  updates: TripReportEditableFields;
  profileKey?: string;
  confirmAuthorNameClaim?: boolean;
};

export function PortalReportEditor({
  busy,
  draft,
  feedback,
  onChange,
  onDismissFeedback,
  onRevert,
  onSave,
  row,
  saveLabel = "Save report",
}: {
  busy: boolean;
  /** Kept for callers; the correction panel changes no attribution. */
  contributors?: readonly PortalContributorOption[];
  draft: TripReportEditableFields;
  feedback: { tone: "success" | "danger"; message: string } | null;
  onChange: (next: TripReportEditableFields) => void;
  /** Kept for callers; the panel that hosts this form owns closing it. */
  onClose?: () => void;
  /** Kept for callers; removal lives in the Trip reports tool. */
  onDelete?: () => void;
  onDismissFeedback: () => void;
  onRevert: () => void;
  onSave: (request: EditorSaveRequest) => void;
  row: PortalRow;
  /** Kept for callers; the form is always the content-only correction form. */
  contentOnly?: boolean;
  saveLabel?: string;
}) {
  const dirty = JSON.stringify(draft) !== JSON.stringify(row.fields);

  function patch(next: Partial<TripReportEditableFields>) {
    onChange({ ...draft, ...next });
  }

  return (
    <EditorPanel variant="default" className="flex min-h-0 flex-col overflow-visible">
      <header className="theme-portal-rule space-y-2.5 border-b px-5 py-4">
        <label htmlFor="portal-report-title" className="theme-text-muted block text-sm font-medium">
          Report title
        </label>
        <Input
          id="portal-report-title"
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          className="font-display text-lg font-semibold"
        />
        <div className="flex flex-wrap items-center gap-2">
          <EditorStatusPill tone="success">Published</EditorStatusPill>
          {row.publicSlug ? (
            <span className="theme-text-muted break-words text-xs">
              /reports/{row.publicSlug}
              {row.license ? ` · ${row.license}` : ""}
            </span>
          ) : null}
          <span className="flex-1" />
          {dirty ? (
            <span className="theme-text-secondary flex items-center gap-1.5 text-xs">
              <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />
              Unsaved changes
            </span>
          ) : null}
        </div>
      </header>
      <EditorToolbar variant="sticky" className="bg-[var(--editor-panel-bg)] px-5">
        <Button type="button" variant="accent" disabled={busy || !dirty} onClick={() => onSave({ updates: draft })}>
          {busy ? "Saving" : saveLabel}
        </Button>
        <Button type="button" variant="ghost" disabled={busy || !dirty} onClick={onRevert}>
          Discard edits
        </Button>
      </EditorToolbar>

      <div className="min-w-0 flex-1 space-y-7 px-5 pb-5 pt-4 [&_:is(input,textarea,button)]:scroll-mt-20">
        {feedback ? (
          <Notice placement="inline" tone={feedback.tone} dismiss={onDismissFeedback}>
            {feedback.message}
          </Notice>
        ) : null}
        <p className="theme-text-muted text-sm">
          Attribution is unchanged here. Byline, attribution and removal stay in the Trip reports tool.
        </p>
        <TripDetailsFields subject={draft.subject} onChange={(next) => patch({ subject: { ...draft.subject, ...next } })} />
        <ReportTagsField tags={draft.tags} onChange={(tags) => patch({ tags })} />
        <SubstancesField substances={draft.substances} onChange={(substances) => patch({ substances })} />
        <fieldset className="min-w-0 space-y-3">
          <legend className="theme-text-muted text-sm font-medium leading-5">Report body</legend>
          <PortalReportTimelineEditor draft={draft} onChange={onChange} />
        </fieldset>
      </div>
    </EditorPanel>
  );
}
