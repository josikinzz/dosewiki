"use client";

import { useId } from "react";

import { Textarea } from "@/components/ui/textarea";
import { DiffPreview } from "../components/DiffPreview";
import type { CommitScopeDataset } from "./commitScope";

/**
 * The body of the commit sheet: every dataset the working set changes, each
 * with its change count and its diff behind a disclosure, then an optional
 * change note. The note is uncontrolled so the dialog request stays static;
 * `onNoteChange` hands each keystroke to the caller.
 */
export function CommitScopeSheet({
  scope,
  onNoteChange,
}: {
  scope: CommitScopeDataset[];
  onNoteChange: (note: string) => void;
}) {
  const noteId = useId();
  return (
    <div className="space-y-4">
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto" aria-label="Datasets in this commit">
        {scope.map((dataset) => (
          <li
            key={dataset.id}
            aria-label={dataset.label}
            className="rounded-lg border border-[var(--editor-panel-border)] px-3 py-2"
          >
            <details>
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span className="theme-text-secondary font-medium">{dataset.label}</span>
                <span className="theme-text-faint text-xs tabular-nums">{dataset.countLabel}</span>
              </summary>
              <DiffPreview diffText={dataset.diff} maxHeight={240} className="mt-2" />
            </details>
          </li>
        ))}
      </ul>
      <div className="space-y-1.5">
        <label htmlFor={noteId} className="theme-text-muted block text-sm font-medium">
          Change note (optional)
        </label>
        <Textarea
          id={noteId}
          rows={2}
          placeholder="Why these changes are going live"
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>
    </div>
  );
}
