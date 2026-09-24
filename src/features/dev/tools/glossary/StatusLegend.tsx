"use client";

import { useId, useState } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";

/**
 * The one legend for review states across the workbench, and the one place it
 * says that approval is not deployment. Panels name a state; this defines it.
 */
export const STATUS_LEGEND: readonly { state: string; meaning: string }[] = [
  { state: "Machine", meaning: "Stored model wording. No person has checked it." },
  { state: "Draft (unreviewed)", meaning: "Saved wording waiting for someone to approve it. Readers do not see it yet." },
  { state: "Live, never checked", meaning: "Wording approved before review tracking existed. It is live; Confirm records a person's check." },
  { state: "Human approved", meaning: "A person approved this wording for the current English and context." },
  { state: "Source changed", meaning: "The English or its context changed after approval, so the approval no longer applies until someone reviews it again." },
  { state: "Re-check", meaning: "The approved wording still shows, but nearby English changed. Check that it still fits." },
];

export const DEPLOYMENT_LINE = "Approved here is not yet deployed; Coverage in Articles shows what has been released.";

export function StatusLegend() {
  const listId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="theme-text-muted text-xs">
      <button type="button" aria-expanded={open} aria-controls={listId} className="theme-focus-ring inline-flex min-h-8 items-center gap-1 rounded-md font-medium" onClick={() => setOpen(!open)}>
        Status legend
        <ExpandIndicator isExpanded={open} />
      </button>
      <div id={listId} hidden={!open} className="max-w-prose space-y-2 pt-1">
        <ul aria-label="Status legend" className="space-y-1">
          {STATUS_LEGEND.map((entry) => (
            <li key={entry.state}><strong className="theme-text-secondary">{entry.state}</strong>: {entry.meaning}</li>
          ))}
        </ul>
        <p>{DEPLOYMENT_LINE}</p>
      </div>
    </div>
  );
}
