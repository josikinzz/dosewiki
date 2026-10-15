"use client";

import type { UiTranslationRow } from "@lib/translation/uiTranslationTypes";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { StateCard } from "@/components/common/StateCard";

export function PendingRefreshList({ rows, refreshed, review }: { rows: readonly UiTranslationRow[]; refreshed: boolean; review: (row: UiTranslationRow) => void }) {
  const waiting = rows.filter((row) => row.pendingRefresh);
  return <div className="space-y-3">
    <p className="theme-text-secondary max-w-prose text-sm">These strings still use wording that an approved glossary term has replaced. The next site release updates them with the term. To keep the current wording on purpose, approve it in the one-at-a-time view; human approval is never refreshed.</p>
    {refreshed ? null : <p className="flex items-start gap-2 text-xs text-[color:var(--theme-warning-text)]"><Icon icon="lucide:circle-alert" size={13} className="mt-px shrink-0" />The last site release could not refresh these strings because it ran offline. They change only in a later site release.</p>}
    {waiting.length === 0 ? <StateCard compact tone="success" icon="lucide:check-check" title="Nothing is waiting" description="No UI string disagrees with an approved glossary term in the current site release." /> : (
      <table aria-label="Waiting for glossary refresh" className="w-full text-left text-sm">
        <thead className="sr-only sm:not-sr-only"><tr className="theme-text-muted text-xs">
          <th className="py-1.5 pr-3 font-medium">English</th><th className="py-1.5 pr-3 font-medium">Current wording</th><th className="py-1.5 pr-3 font-medium">Term</th><th className="py-1.5 pr-3 font-medium">Approved term translation</th><th className="py-1.5 font-medium"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--theme-border-subtle)]">{waiting.map((row) => {
          const unrecorded = !row.pendingRefresh?.term && !row.pendingRefresh?.expectedTarget;
          return <tr key={row.id} aria-label={row.source} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3 align-top sm:table-row sm:py-0">
            <td className="theme-text-primary col-start-1 break-words sm:max-w-xs sm:py-2.5 sm:pr-3" lang="en">{row.source}</td>
            <td className="theme-text-primary col-start-1 break-words sm:max-w-xs sm:py-2.5 sm:pr-3"><span className="theme-text-muted sm:hidden">Now: </span>{row.compiledTarget ?? ""}</td>
            {unrecorded ? (
              <td colSpan={2} className="theme-text-faint col-start-1 sm:py-2.5 sm:pr-3">Term not recorded<span className="sr-only">: Not recorded</span></td>
            ) : <>
              <td className="col-start-1 sm:py-2.5 sm:pr-3"><span className="theme-text-muted sm:hidden">Term: </span>{row.pendingRefresh?.term ?? <span className="theme-text-faint">Not recorded</span>}</td>
              <td className="col-start-1 sm:py-2.5 sm:pr-3"><span className="theme-text-muted sm:hidden">Becomes: </span>{row.pendingRefresh?.expectedTarget ?? <span className="theme-text-faint">Not recorded</span>}</td>
            </>}
            <td className="col-start-2 row-span-4 row-start-1 sm:py-2.5"><Button type="button" variant="outline" size="sm" aria-label={`Review ${row.source}`} onClick={() => review(row)}>Review</Button></td>
          </tr>;
        })}</tbody>
      </table>
    )}
  </div>;
}
