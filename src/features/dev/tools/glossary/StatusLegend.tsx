"use client";

import { useId, useState } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { EditorStatusPill, type EditorStatusPillTone } from "@/features/dev/components";

export const STATUS_LEGEND: readonly { state: string; meaning: string; tone: EditorStatusPillTone }[] = [
  { state: "Machine", meaning: "Stored model wording. No person has checked it.", tone: "neutral" },
  { state: "Draft (unreviewed)", meaning: "Saved wording waiting for someone to approve it. Readers do not see it yet.", tone: "warning" },
  { state: "Live, never checked", meaning: "Wording approved before review tracking existed. It is live; Confirm records a person's check.", tone: "info" },
  { state: "Human approved", meaning: "A person approved this wording for the current English and context.", tone: "success" },
  { state: "Source changed", meaning: "The English or its context changed after approval, so the approval no longer applies until someone reviews it again.", tone: "danger" },
  { state: "Re-check", meaning: "The approved wording still shows, but nearby English changed. Check that it still fits.", tone: "warning" },
];

export const DEPLOYMENT_LINE = "Approved here is not yet deployed; Coverage in Articles shows what has been released.";

export function StatusLegend() {
  const listId = useId();
  const [open, setOpen] = useState(false);
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape closes the open legend; the button is the control.
    <div className="theme-text-muted relative w-full text-xs sm:w-auto" onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); } }}>
      <button type="button" aria-expanded={open} aria-controls={listId} className="theme-focus-ring inline-flex min-h-8 items-center gap-1 rounded-control font-medium [@media(pointer:coarse)]:min-h-11" onClick={() => setOpen(!open)}>
        Status legend
        <ExpandIndicator isExpanded={open} />
      </button>
      <div id={listId} hidden={!open} className="max-w-prose space-y-3 pb-1 pt-2 sm:absolute sm:right-0 sm:z-50 sm:mt-1 sm:w-[30rem] sm:rounded-card sm:border sm:border-[color:var(--editor-panel-border)] sm:bg-[var(--editor-panel-bg)] sm:p-4 sm:shadow-[var(--theme-elevation-overlay)]">
        <ul aria-label="Status legend" className="space-y-2">
          {STATUS_LEGEND.map((entry) => (
            <li key={entry.state} className="grid gap-x-3 gap-y-1 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
              <span><EditorStatusPill tone={entry.tone} inline>{entry.state}</EditorStatusPill></span>
              <span className="theme-text-secondary">{entry.meaning}</span>
            </li>
          ))}
        </ul>
        <p className="theme-text-secondary">{DEPLOYMENT_LINE}</p>
      </div>
    </div>
  );
}
