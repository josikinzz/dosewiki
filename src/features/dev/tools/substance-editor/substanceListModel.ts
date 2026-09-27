/**
 * The Substances list: which articles show, in what order, and what each row
 * says about the member's own work on it. Pure, so the list column, the pane
 * and the tests read the same rules.
 */
import type { ReviewState } from "@/schema/substance/editorial";
import type { EditorStatusPillTone } from "@/features/dev/components";
import { REVIEW_STATUS_NAMES } from "@/features/dev/tools/review-mode/reviewStatusNames";
import type { ProposalStatus } from "@/features/dev/tools/queue/queueModel";
import { REVIEW_STATUS_META as BASE_REVIEW_STATUS_META } from "./types";

export type SortOrder = "alpha-asc" | "alpha-desc";

/** Which articles the list holds: the publicly listed ones, the member's own work, or every article. */
export type SubstanceView = "listed" | "mine" | "all";

export type ReviewFilter = "any" | ReviewState;

/** Every review state an article can carry, `stale` included (an article whose content moved since sign-off). */
export const REVIEW_STATUS_META: Record<ReviewState, { label: string; tone: EditorStatusPillTone }> = {
  ...BASE_REVIEW_STATUS_META,
  // Most articles wait for review; a row of red pills would read as an alarm on every one.
  needed: { ...BASE_REVIEW_STATUS_META.needed, tone: "neutral" },
  stale: { label: REVIEW_STATUS_NAMES.stale, tone: "warning" },
};
export const REVIEW_STATES = ["needed", "in_progress", "completed", "stale"] as const satisfies readonly ReviewState[];

/** The member's own work on one article, from `/api/dev/my-work`. */
export type ArticleWork = {
  /** When their private draft was last saved. */
  draftAt?: string;
  /** Their newest open proposal on it. */
  proposal?: { id: string; status: ProposalStatus };
};

export type SubstanceRow = {
  slug: string;
  name: string;
  reviewStatus: ReviewState;
  /** Reachable only by its address; hidden from the public index and search. */
  directUrlOnly: boolean;
  work: ArticleWork | null;
};

export const VIEW_LABELS: Record<SubstanceView, string> = { listed: "Listed", mine: "Your work", all: "All" };

export function matchesSearch(row: SubstanceRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return row.name.toLowerCase().includes(needle) || row.slug.toLowerCase().includes(needle);
}

export function inView(row: SubstanceRow, view: SubstanceView): boolean {
  if (view === "all") return true;
  if (view === "mine") return !!row.work && (!!row.work.draftAt || !!row.work.proposal);
  return !row.directUrlOnly;
}

export function sortRows(rows: SubstanceRow[], order: SortOrder): SubstanceRow[] {
  return [...rows].sort((a, b) => (order === "alpha-desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
}

/** How many rows each view holds under the current search and review filter. */
export function viewCounts(rows: SubstanceRow[], query: string, review: ReviewFilter): Record<SubstanceView, number> {
  const counts: Record<SubstanceView, number> = { listed: 0, mine: 0, all: 0 };
  for (const row of rows) {
    if (!matchesSearch(row, query) || (review !== "any" && row.reviewStatus !== review)) continue;
    for (const view of ["listed", "mine", "all"] as const) if (inView(row, view)) counts[view] += 1;
  }
  return counts;
}

/** How many rows each review state holds in the current view and search. */
export function reviewCounts(rows: SubstanceRow[], query: string, view: SubstanceView): Record<ReviewFilter, number> {
  const counts: Record<ReviewFilter, number> = { any: 0, needed: 0, in_progress: 0, completed: 0, stale: 0 };
  for (const row of rows) {
    if (!matchesSearch(row, query) || !inView(row, view)) continue;
    counts.any += 1;
    counts[row.reviewStatus] += 1;
  }
  return counts;
}

export function filterRows(rows: SubstanceRow[], { query, view, review, order }: {
  query: string; view: SubstanceView; review: ReviewFilter; order: SortOrder;
}): SubstanceRow[] {
  return sortRows(rows.filter((row) => matchesSearch(row, query) && inView(row, view) && (review === "any" || row.reviewStatus === review)), order);
}

const PROPOSAL_WORDS: Partial<Record<ProposalStatus, string>> = {
  submitted: "Proposal waiting",
  changes_requested: "Changes requested",
};

/** One short phrase for the member's work on a row, or null. */
export function describeWork(work: ArticleWork | null): { label: string; icon: string; tone: "neutral" | "warning" } | null {
  if (!work) return null;
  if (work.proposal?.status === "changes_requested") return { label: "Changes requested", icon: "lucide:message-square-warning", tone: "warning" };
  if (work.draftAt) return { label: "Your draft", icon: "lucide:file-pen-line", tone: "neutral" };
  const words = work.proposal ? PROPOSAL_WORDS[work.proposal.status] : undefined;
  return words ? { label: words, icon: "lucide:send", tone: "neutral" } : null;
}

/**
 * The member's work keyed by article slug, from their drafts and open
 * proposals. A proposal names articles through its article targets; the
 * newest open one wins.
 */
export function workBySlug(
  drafts: ReadonlyArray<{ slug: string; updatedAt: string }>,
  proposals: ReadonlyArray<{ _id: string; status: ProposalStatus; createdAt: string; targets: ReadonlyArray<{ kind: string; key: string }> }>,
): Map<string, ArticleWork> {
  const work = new Map<string, ArticleWork>();
  for (const draft of drafts) work.set(draft.slug, { ...work.get(draft.slug), draftAt: draft.updatedAt });
  const newestFirst = [...proposals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const proposal of newestFirst) {
    for (const target of proposal.targets) {
      if (target.kind !== "article") continue;
      const entry = work.get(target.key) ?? {};
      if (!entry.proposal) work.set(target.key, { ...entry, proposal: { id: proposal._id, status: proposal.status } });
    }
  }
  return work;
}

/** "20 listed substances", "3 of 20 match", for the count line under the heading. */
export function describeListCount(shown: number, total: number, filtered: boolean): string {
  if (!filtered) return `${shown} ${shown === 1 ? "substance" : "substances"}`;
  return `${shown} of ${total} shown`;
}
