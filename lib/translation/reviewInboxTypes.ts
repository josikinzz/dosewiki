/**
 * Browser-safe contracts for the Review Inbox: one list, across review scopes,
 * of everything that needs a person. The Inbox is a read model; each item names
 * the existing mutation its Accept calls, with the revision the reviewer saw.
 */
/**
 * Where an item lives: a review scope with its own editor, a stored machine
 * translation (`segment`, a QA finding), or a reader suggestion from the public
 * glossary (`feedback`).
 */
export type InboxScope = "glossary" | "ui" | "narrative" | "segment" | "feedback";

/**
 * Why an item is listed. A code union so later slices add their own reasons
 * (QA findings, reader suggestions, model suggestions) without new item shapes.
 */
export type InboxReason =
  /** A glossary row that is live but nobody checked (`legacy_unverified`). */
  | "glossary-never-checked"
  /** A human UI approval whose English or context changed since it was approved. */
  | "ui-source-changed"
  /** A human article-sentence approval whose own English changed; readers see machine wording. */
  | "narrative-source-changed"
  /** A human article-sentence approval still shown, but a neighbouring sentence changed (`apply-recheck`). */
  | "narrative-recheck"
  /** The validator rejected every attempt and nothing is stored, so readers see English. */
  | "segment-rejected"
  /** A stored translation whose English mentions an approved glossary term and whose target lacks its rendering. */
  | "glossary-disagreement"
  /** English words left in a stored Chinese translation (the validator's LEFTOVER_LATIN finding). */
  | "leftover-latin"
  /** A new suggestion a reader sent from the public glossary. */
  | "reader-suggestion";

/** QA findings a reviewer can mark "Fine here". */
export type QaFindingKind = "glossary-disagreement" | "leftover-latin";

/**
 * What "Fine here" records: an exception keyed by locale (the request's),
 * segment hash, term, and revision. For a glossary disagreement the revision is
 * the approved rendering's glossary revision; for leftover English it is the
 * stored translation's digest. A changed source (new hash), rendering, or
 * translation makes a new key, so the finding returns.
 */
export type InboxException = { finding: QaFindingKind; hash: string; term: string; revision: string };

/** The review-table key of one exception (scope `qa-exception`). */
export function qaExceptionKey(exception: InboxException): string {
  return JSON.stringify([exception.finding, exception.hash, exception.term, exception.revision]);
}

/** What Accept sends: the existing confirm or save-and-approve mutation, pinned to the revision shown. */
export type InboxAccept =
  | { kind: "glossary-confirm"; term: string; expectedRevision: string }
  | { kind: "ui-approve"; id: string; expectedRevision: number; target: string }
  | { kind: "narrative-approve"; slug: string; id: string; sourceVersion: string; expectedRevision: number; target: string }
  /** Marks a reader suggestion resolved through the existing feedback status mutation. */
  | { kind: "feedback-resolve"; id: string };

export type InboxItem = {
  scope: InboxScope;
  /** Unique within the scope: the glossary term, UI message id, or narrative identity. */
  id: string;
  reason: InboxReason;
  /** The current English source. */
  english: string;
  /** The wording readers see now; null when the locale shows English or nothing. */
  live: string | null;
  /** A proposed replacement: a reader's alternative wording (model suggestions come later). */
  suggestion?: string;
  /** What the check found, in one line: the defects, the glossary rendering, the English left in, or the reader's comment. */
  detail?: string;
  /** Present when "Fine here" applies: the exception it records. */
  exception?: InboxException;
  /** The human approval this item is about, when its English differs from `english`. */
  previous?: { english: string; target: string };
  /** A short location for the reviewer: glossary kind, UI context, or article and field. */
  where: string;
  /** The revision the reviewer sees; Accept and Edit act on exactly this revision. */
  revision: string;
  /** Deep link to the existing editor for this item. */
  href: string;
  /** Null when there is nothing a single click can accept, so only Edit applies. */
  accept: InboxAccept | null;
};

export const INBOX_PAGE_SIZE = 50;

export type InboxResponse = {
  ok: true;
  locale: string;
  items: InboxItem[];
  /** Every item that needs a person, across all pages. */
  total: number;
  offset: number;
  pageSize: number;
  /** The scopes and reasons this read checked, for an honest empty state. */
  checked: InboxReason[];
  /** Items per reason across every page, before the reason filter. */
  counts: Partial<Record<InboxReason, number>>;
  /** The reason filter this page applies, if any. */
  reason: InboxReason | null;
};

/** Reader-facing wording for each reason. */
export const INBOX_REASON_LABEL: Record<InboxReason, string> = {
  "glossary-never-checked": "Live, never checked",
  "ui-source-changed": "English changed since approval",
  "narrative-source-changed": "English changed since approval",
  "narrative-recheck": "Re-check: nearby English changed",
  "segment-rejected": "Rejected, readers see English",
  "glossary-disagreement": "Disagrees with the glossary",
  "leftover-latin": "English left in",
  "reader-suggestion": "Reader suggestion",
};

/** What each reason's check covers, named in the empty state. */
export const INBOX_CHECK_LABEL: Record<InboxReason, string> = {
  "glossary-never-checked": "glossary terms that are live but never checked",
  "ui-source-changed": "UI labels whose English changed after approval",
  "narrative-source-changed": "article sentences whose English changed after approval",
  "narrative-recheck": "article sentences whose neighbouring English changed",
  "segment-rejected": "rejected translations that fell back to English",
  "glossary-disagreement": "stored translations that disagree with the glossary",
  "leftover-latin": "stored translations with English left in",
  "reader-suggestion": "new reader suggestions from the public glossary",
};

export const INBOX_SCOPE_LABEL: Record<InboxScope, string> = {
  glossary: "Glossary",
  ui: "UI label",
  narrative: "Article",
  segment: "Translation",
  feedback: "Reader",
};

/** Deep links into the existing workbench editors. Views are named, so a later layout can remap them. */
export const WORKBENCH_PATH = "/dev/glossary";
export function glossaryTermHref(locale: string, term: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationView: "glossary", translationTerm: term })}`;
}
export function uiLabelHref(locale: string, id: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationView: "labels", translationLabel: id })}`;
}
export function narrativeSegmentHref(locale: string, slug: string, id: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationReview: "article", translationLocale: locale, translationSlug: slug, translationSegment: id })}`;
}

/** Workbench views a deep link can open. */
export type WorkbenchLinkView = "inbox" | "glossary" | "labels" | "narrative";
/** Reads a workbench deep link written by the builders above or by the Narratives view. */
export function parseWorkbenchDeepLink(search: string): { view: WorkbenchLinkView; term?: string; label?: string } | null {
  const params = new URLSearchParams(search);
  if (params.get("translationReview") === "article") return { view: "narrative" };
  const view = params.get("translationView");
  if (view === "inbox") return { view };
  if (view === "glossary") return { view, term: params.get("translationTerm") ?? undefined };
  if (view === "labels") return { view, label: params.get("translationLabel") ?? undefined };
  return null;
}
