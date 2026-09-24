"use client";

import { useId, useState } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";

/**
 * The one legend for review states across the workbench, and the one place it
 * says that approval is not deployment. Panels name a state; this defines it.
 */
export const STATUS_LEGEND: readonly { state: string; meaning: string }[] = [
  { state: "Machine", meaning: "Stored model wording. No person has checked it." },
  { state: "Draft", meaning: "Saved wording waiting for someone to approve that exact revision. Readers do not see it." },
  { state: "Live, never checked", meaning: "Wording approved before review tracking existed. It is live; Confirm records a person's check." },
  { state: "Human approved", meaning: "A person approved this revision in its current English and context." },
  { state: "Source changed", meaning: "The English or its context changed after approval, so the approval no longer applies until someone reviews it again." },
  { state: "Re-check", meaning: "The approved wording still shows, but nearby English changed. Check that it still fits." },
];

export const DEPLOYMENT_LINE = "Approved here is not deployed; Pages shows release evidence.";

export function StatusLegend() {
  const listId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="theme-text-faint flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <button type="button" aria-expanded={open} aria-controls={listId} className="theme-focus-ring inline-flex items-center gap-1 rounded-md font-medium" onClick={() => setOpen(!open)}>
        Status legend
        <ExpandIndicator isExpanded={open} />
      </button>
      <span>{DEPLOYMENT_LINE}</span>
      <ul id={listId} aria-label="Status legend" hidden={!open} className="w-full space-y-1 pt-1">
        {STATUS_LEGEND.map((entry) => (
          <li key={entry.state}><strong className="theme-text-secondary">{entry.state}</strong>: {entry.meaning}</li>
        ))}
      </ul>
    </div>
  );
}
