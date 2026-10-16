export type InboxScope = "glossary" | "ui" | "narrative" | "segment" | "feedback" | "note" | "model";

export type InboxReason =
  | "glossary-never-checked"
  | "ui-source-changed"
  | "narrative-source-changed"
  | "narrative-recheck"
  | "segment-rejected"
  | "glossary-disagreement"
  | "leftover-latin"
  | "reader-suggestion"
  | "note-orphaned"
  | "model-suggestion";

export type QaFindingKind = "glossary-disagreement" | "leftover-latin";

export type InboxException = { finding: QaFindingKind; hash: string; term: string; revision: string };

export function qaExceptionKey(exception: InboxException): string {
  return JSON.stringify([exception.finding, exception.hash, exception.term, exception.revision]);
}

export type InboxAccept =
  | { kind: "glossary-confirm"; term: string; expectedRevision: string }
  | { kind: "ui-approve"; id: string; expectedRevision: number; target: string }
  | { kind: "narrative-approve"; slug: string; id: string; sourceVersion: string; expectedRevision: number; target: string }
  | { kind: "feedback-resolve"; id: string }
  | { kind: "suggestion-accept"; id: string; expectedRevision: number };

export type InboxOrigin = { model: string; runId: string; promptVersion: string };

export type InboxItem = {
  scope: InboxScope;
  id: string;
  reason: InboxReason;
  english: string;
  live: string | null;
  suggestion?: string;
  origin?: InboxOrigin;
  detail?: string;
  exception?: InboxException;
  previous?: { english: string; target: string };
  where: string;
  revision: string;
  href: string;
  accept: InboxAccept | null;
};

export const INBOX_PAGE_SIZE = 50;

export type InboxResponse = {
  ok: true;
  locale: string;
  items: InboxItem[];
  total: number;
  offset: number;
  pageSize: number;
  checked: InboxReason[];
  counts: Partial<Record<InboxReason, number>>;
  reason: InboxReason | null;
};

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

export const WORKBENCH_PATH = "/dev/glossary";
export function glossaryTermHref(locale: string, term: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationView: "words", translationTerm: term })}`;
}
export function readerSuggestionsHref(locale?: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ ...(locale ? { locale } : {}), translationView: "suggestions" })}`;
}
export function uiLabelHref(locale: string, id: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationView: "words", translationLabel: id })}`;
}
export function narrativeSegmentHref(locale: string, slug: string, id: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationReview: "article", translationLocale: locale, translationSlug: slug, translationSegment: id })}`;
}

export function translatorNoteHref(locale: string, slug: string, section: string): string {
  return `${WORKBENCH_PATH}?${new URLSearchParams({ locale, translationReview: "article", translationLocale: locale, translationSlug: slug, translationNote: section })}`;
}

export type WorkbenchView = "inbox" | "suggestions" | "words" | "pages";
export type WordsList = "terms" | "labels" | "style";
const WORDS_LISTS: readonly WordsList[] = ["terms", "labels", "style"];
export type PagesSection = "coverage" | "changes";
export type WorkbenchDeepLink = { view: WorkbenchView; words?: WordsList; pages?: PagesSection; term?: string; label?: string };

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
