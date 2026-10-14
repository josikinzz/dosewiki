/**
 * Browser-safe contracts for the Review Inbox: one list, across review scopes,
 * of everything that needs a person. The Inbox is a read model; each item names
 * the existing mutation its Accept calls, with the revision the reviewer saw.
 */
/**
 * Where an item lives: a review scope with its own editor, a stored machine
 * translation (`segment`, a QA finding), a reader suggestion from the public
 * glossary (`feedback`), or a model fluency suggestion for an article sentence
 * (`model`).
 */
export type InboxScope = "glossary" | "ui" | "narrative" | "segment" | "feedback" | "note" | "model";

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
  /** A translation readers see (stored, or a human correction) whose English mentions an approved glossary term and which lacks its rendering. */
  | "glossary-disagreement"
  /** English words left in a Chinese translation readers see (the validator's LEFTOVER_LATIN finding). */
  | "leftover-latin"
  /** A new suggestion a reader sent from the public glossary. */
  | "reader-suggestion"
  /** A translator's note whose section is gone from the English; hidden from readers. */
  | "note-orphaned"
  /** A model fluency suggestion for one article sentence; `origin` names the model and run. */
  | "model-suggestion";

/** QA findings a reviewer can mark "Fine here". */
export type QaFindingKind = "glossary-disagreement" | "leftover-latin";

/**
 * What "Fine here" records: an exception keyed by locale (the request's),
 * segment hash, term, and revision. For a glossary disagreement the revision is
 * the approved rendering's glossary revision joined with the stored
 * translation's digest; for leftover English it is the stored translation's
 * digest. A changed source (new hash), rendering, or
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
  | { kind: "feedback-resolve"; id: string }
  /** Saves a model suggestion as a narrative draft with reason Fluency; never an approval. */
  | { kind: "suggestion-accept"; id: string; expectedRevision: number };

/** Which model run produced a model suggestion. */
export type InboxOrigin = { model: string; runId: string; promptVersion: string };

export type InboxItem = {
  scope: InboxScope;
  /** Unique within the scope: the glossary term, UI message id, or narrative identity. */
  id: string;
  reason: InboxReason;
  /** The current English source. */
  english: string;
  /** The wording readers see now; null when the locale shows English or nothing. */
  live: string | null;
  /** A proposed replacement: a reader's alternative wording, or a model's suggested sentence. */
  suggestion?: string;
  /** Present on a model suggestion: the model and run that produced it. */
  origin?: InboxOrigin;
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
  "note-orphaned": "Note's section removed",
  "model-suggestion": "Model fluency suggestion",
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
  "note-orphaned": "translator's notes whose section left the English article",
  "model-suggestion": "model fluency suggestions waiting for a person",
};

export const INBOX_SCOPE_LABEL: Record<InboxScope, string> = {
  glossary: "Glossary",
  ui: "UI label",
  narrative: "Article",
  segment: "Translation",
  feedback: "Reader",
  note: "Translator's note",
  model: "Model",
};

/**
 * Deep links into the workbench editors. The workbench has three views: Inbox,
 * Words (glossary terms and UI labels), and Pages (article reader, coverage,
 * changes, and admin runs).
 */
export const WORKBENCH_PATH = "/dev/glossary";
export function glossaryTermHref(locale: string, term: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationView: "words", translationTerm: term })}`;
}
/** Opens the suggestions readers sent from the public glossary, in one language or the workbench's first. */
export function readerSuggestionsHref(locale?: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ ...(locale ? { locale } : {}), translationView: "suggestions" })}`;
}
export function uiLabelHref(locale: string, id: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationView: "words", translationLabel: id })}`;
}
export function narrativeSegmentHref(locale: string, slug: string, id: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationReview: "article", translationLocale: locale, translationSlug: slug, translationSegment: id })}`;
}

/** Opens the article reader on one translator's note. */
export function translatorNoteHref(locale: string, slug: string, section: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationReview: "article", translationLocale: locale, translationSlug: slug, translationNote: section })}`;
}

/** The workbench's views: what is waiting, what readers suggested, the words, and the pages. */
export type WorkbenchView = "inbox" | "suggestions" | "words" | "pages";
/** Words holds the glossary terms, the UI labels, and the locale style guide. */
export type WordsList = "terms" | "labels" | "style";
const WORDS_LISTS: readonly WordsList[] = ["terms", "labels", "style"];
/** The drawers under the article reader in Pages that a link can open. */
export type PagesSection = "coverage" | "changes";
export type WorkbenchDeepLink = { view: WorkbenchView; words?: WordsList; pages?: PagesSection; term?: string; label?: string };

/**
 * Reads a workbench deep link. `translationView=suggestions` opens the
 * reader suggestions; `translationView=words` opens Words on the list
 * `translationWords` names (`terms`, `labels`, or `style`), else on the list
 * a `translationTerm` or `translationLabel` implies. Links written before the
 * three-view layout keep working: `glossary` and `labels` open Words, and `coverage`, `changes`, and
 * `narrative` (like `translationReview=article`) open Pages.
 */
export function parseWorkbenchDeepLink(search: string): WorkbenchDeepLink | null {
  const params = new URLSearchParams(search);
  if (params.get("translationReview") === "article") return { view: "pages" };
  const term = params.get("translationTerm") ?? undefined;
  const label = params.get("translationLabel") ?? undefined;
  switch (params.get("translationView")) {
    case "inbox": return { view: "inbox" };
    case "suggestions": return { view: "suggestions" };
    case "words": {
      const list = params.get("translationWords");
      if (list && (WORDS_LISTS as readonly string[]).includes(list)) return { view: "words", words: list as WordsList, term, label };
      return label !== undefined ? { view: "words", words: "labels", label } : { view: "words", words: "terms", term };
    }
    case "glossary": return { view: "words", words: "terms", term };
    case "labels": return { view: "words", words: "labels", label };
    case "pages":
    case "narrative": return { view: "pages" };
    case "coverage": return { view: "pages", pages: "coverage" };
    case "changes": return { view: "pages", pages: "changes" };
    default: return null;
  }
}
