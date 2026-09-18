"use client";

import { useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorSection } from "@/features/dev/components";

export type NarrativeHistoryEntry = { createdAt: string; actorEmail: string; revision: string; before: unknown; after: unknown };
export function NarrativeHistory({ entries }: { entries: NarrativeHistoryEntry[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <EditorSection title="Recent document history" description="The five latest changes to this document, recorded atomically with publication.">
    {entries.length ? entries.map(entry => <div key={entry.revision} className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <p className="theme-text-muted min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{entry.createdAt} · {entry.actorEmail}</p>
        <ExpandButton variant="inline" className={`shrink-0 justify-center before:inset-0 ${TOUCH_ICON}`} isExpanded={expanded === entry.revision} onToggle={() => setExpanded(current => current === entry.revision ? null : entry.revision)} ariaLabel={`${expanded === entry.revision ? "Hide" : "Show"} recorded changes from ${entry.createdAt} by ${entry.actorEmail}`} />
      </div>
      {expanded === entry.revision ? <div className="grid min-w-0 gap-3 md:grid-cols-2"><div><h4 className="font-semibold">Before</h4><pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(entry.before, null, 2)}</pre></div><div><h4 className="font-semibold">After</h4><pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(entry.after, null, 2)}</pre></div></div> : null}
    </div>) : <p className="theme-text-muted text-sm">No contextual publication has been recorded yet.</p>}
  </EditorSection>;
}
