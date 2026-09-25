"use client";

import { Button } from "@/components/ui/button";
import type { MergeChoices, MergeConflict, MergeSide } from "../../../../lib/proposals/threeWayMerge";

export type MergeConflictCopy = {
  /** Who made the local draft's change: "You changed". */
  mine: string;
  /** Who made the latest record's change: "Someone else changed". */
  theirs: string;
  /** The button that keeps the local value: "Use yours". */
  useMine: string;
  /** The button that keeps the latest value: "Use theirs". */
  useTheirs: string;
};

export const MERGE_CONFLICT_COPY: MergeConflictCopy = {
  mine: "You changed",
  theirs: "Someone else changed",
  useMine: "Use yours",
  useTheirs: "Use theirs",
};

/** How many overlapping fields still wait on a choice, as one line. */
export function unresolvedConflictText(count: number): string {
  return count === 0
    ? "Every field both of you changed has a chosen version."
    : `Choose a version for ${count === 1 ? "1 field" : `${count} fields`} both of you changed.`;
}

function Side({ heading, value, chosen, action, label, onChoose }: {
  heading: string; value: string; chosen: boolean; action: string; label: string; onChoose: () => void;
}) {
  return <div className="min-w-0 space-y-2">
    <p className="theme-text-muted text-sm">{heading}</p>
    <p className="theme-text-primary max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{value}</p>
    <Button type="button" variant={chosen ? "accent" : "outline"} size="sm" aria-pressed={chosen} aria-label={`${action} ${label}`} onClick={onChoose}>
      {action}
    </Button>
  </div>;
}

/**
 * The fields both sides of a merge changed, each with both versions side by
 * side and who changed what. Nothing is chosen for the person: every row waits
 * for an explicit pick, and the caller keeps its final action closed until
 * `unresolved` is empty. Choosing writes nothing anywhere.
 */
export function MergeConflictChoices({
  conflicts, choices, onChoose, label, format, copy = MERGE_CONFLICT_COPY,
}: {
  conflicts: MergeConflict[];
  choices: MergeChoices;
  onChoose: (path: string, side: MergeSide) => void;
  /** The field's place in words. */
  label: (path: string) => string;
  /** One side's value as a person reads it. */
  format: (value: unknown, path: string) => string;
  copy?: MergeConflictCopy;
}) {
  if (conflicts.length === 0) return null;
  const unresolved = conflicts.filter((conflict) => !choices[conflict.path]).length;
  return <section aria-label="Changed by both" className="min-w-0 space-y-4">
    <p role="status" className="theme-text-primary text-sm font-medium">{unresolvedConflictText(unresolved)}</p>
    {conflicts.map((conflict) => {
      const place = label(conflict.path);
      const chosen = choices[conflict.path];
      return <div key={conflict.path} role="group" aria-label={`${place}, changed by both`} className="min-w-0 space-y-2">
        <h4 className="theme-text-primary text-sm font-semibold">{place}</h4>
        <p className="theme-text-faint text-xs">Before either change: {format(conflict.base, conflict.path)}</p>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <Side heading={copy.mine} value={format(conflict.mine, conflict.path)} chosen={chosen === "mine"} action={copy.useMine} label={place} onChoose={() => onChoose(conflict.path, "mine")} />
          <Side heading={copy.theirs} value={format(conflict.theirs, conflict.path)} chosen={chosen === "theirs"} action={copy.useTheirs} label={place} onChoose={() => onChoose(conflict.path, "theirs")} />
        </div>
      </div>;
    })}
  </section>;
}
