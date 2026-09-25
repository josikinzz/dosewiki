"use client";

import type { UiTranslationRow } from "@lib/translation/uiTranslationTypes";
import { Button } from "@/components/ui/button";
import { StateCard } from "@/components/common/StateCard";

/**
 * UI strings whose compiled wording disagrees with an approved glossary term.
 * The catalog keeps the old wording until an online build regenerates it, so
 * this list explains why a page still shows it and which term will change it.
 */
export function PendingRefreshList({ rows, refreshed, review }: { rows: readonly UiTranslationRow[]; refreshed: boolean; review: (row: UiTranslationRow) => void }) {
  const waiting = rows.filter((row) => row.pendingRefresh);
  return <div className="space-y-3">
    <p className="theme-text-secondary text-sm">These strings still use wording that an approved glossary term has replaced. The next site release updates them with the term. To keep the current wording on purpose, approve it in the one-at-a-time view; human approval is never refreshed.</p>
    {refreshed ? null : <p className="theme-text-faint text-xs">The last site release could not refresh these strings because it ran offline. They change only in a later site release.</p>}
    {waiting.length === 0 ? <StateCard compact title="Nothing is waiting" description="No UI string disagrees with an approved glossary term in the current site release." /> : <div className="overflow-x-auto">
      <table aria-label="Waiting for glossary refresh" className="w-full text-left text-sm">
        <thead className="theme-text-faint text-xs"><tr><th className="py-1 pr-3 font-normal">English</th><th className="py-1 pr-3 font-normal">Current wording</th><th className="py-1 pr-3 font-normal">Term</th><th className="py-1 pr-3 font-normal">Approved term translation</th><th className="py-1 font-normal"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{waiting.map((row) => <tr key={row.id} aria-label={row.source} className="align-top">
          <td className="theme-text-primary max-w-xs break-words py-1 pr-3">{row.source}</td>
          <td className="theme-text-primary max-w-xs break-words py-1 pr-3">{row.compiledTarget ?? ""}</td>
          <td className="py-1 pr-3">{row.pendingRefresh?.term ?? <span className="theme-text-faint">Not recorded</span>}</td>
          <td className="py-1 pr-3">{row.pendingRefresh?.expectedTarget ?? <span className="theme-text-faint">Not recorded</span>}</td>
          <td className="py-1"><Button type="button" variant="outline" size="sm" aria-label={`Review ${row.source}`} onClick={() => review(row)}>Review</Button></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
