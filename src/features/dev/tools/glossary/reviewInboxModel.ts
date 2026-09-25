/**
 * Review Inbox client calls. Reading is the inbox route; Accept dispatches to
 * the existing workbench mutation each item names, at the revision it showed.
 */
import type { InboxAccept, InboxException, InboxItem, InboxReason, InboxResponse } from "@lib/translation/reviewInboxTypes";
import { confirmTerms } from "./glossaryModel";
import type { GlossaryRendering } from "@lib/translation/glossaryConflicts";
import { TranslationRequestError, translationRequest } from "./TranslationHistory";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";

export const INBOX_ACCEPT_REASON = "Accepted from the Inbox";

export async function fetchInbox(locale: string, offset = 0, reason: InboxReason | null = null): Promise<InboxResponse> {
  return translationRequest<InboxResponse>(`/api/dev/translation-inbox?${new URLSearchParams({ locale, offset: String(offset), ...(reason ? { reason } : {}) })}`);
}

/** "Fine here": records the exception the item names, at the revision it showed. */
export async function markFineHere(locale: string, exception: InboxException): Promise<void> {
  await translationRequest("/api/dev/translation-inbox/exception", { locale, ...exception });
}

/** The approved glossary renderings an Accept left out, when the save route refused it with GLOSSARY_CONFLICT. */
export function glossaryConflictsOf(error: unknown): GlossaryRendering[] | null {
  if (!(error instanceof TranslationRequestError) || error.code !== "GLOSSARY_CONFLICT" || !Array.isArray(error.payload.conflicts)) return null;
  return error.payload.conflicts.flatMap((row: unknown) => {
    const { term, target } = (row ?? {}) as Partial<GlossaryRendering>;
    return typeof term === "string" && typeof target === "string" ? [{ term, target }] : [];
  });
}

/**
 * Save the shown wording as the human draft, then approve exactly the revision
 * that save produced. `glossaryExceptions` are the terms the reviewer marked
 * "Fine here" after the save route reported them missing.
 */
async function saveThenApprove(url: string, base: Record<string, unknown>, expectedRevision: number, target: string, revisionOf: (payload: Record<string, unknown>) => number, glossaryExceptions: readonly string[]): Promise<void> {
  const saved = await translationRequest<Record<string, unknown>>(url, { ...base, action: "save", expectedRevision, target, reason: INBOX_ACCEPT_REASON, ...(glossaryExceptions.length ? { glossaryExceptions } : {}) });
  await translationRequest(url, { ...base, action: "approve", expectedRevision: revisionOf(saved), reason: INBOX_ACCEPT_REASON });
}

export async function acceptInboxItem(locale: string, accept: InboxAccept, glossaryExceptions: readonly string[] = []): Promise<void> {
  switch (accept.kind) {
    case "glossary-confirm":
      await confirmTerms(locale, [accept.term], { [accept.term]: accept.expectedRevision });
      return;
    case "ui-approve":
      return saveThenApprove("/api/dev/translation-workbench", { locale, id: accept.id }, accept.expectedRevision, accept.target, (payload) => (payload.row as { revision: number }).revision, glossaryExceptions);
    case "feedback-resolve":
      // The existing feedback status mutation, as the Glossary view's reader feedback queue uses it.
      await translationRequest(`/api/glossary-feedback/${encodeURIComponent(accept.id)}/status`, { status: "resolved", note: "Resolved from the Inbox" });
      invalidateDevRailBadge("glossary-feedback");
      return;
    case "suggestion-accept":
      // Saves the model's sentence as a Fluency draft; it never approves.
      await translationRequest("/api/dev/translation-inbox/suggestion", { locale, id: accept.id, expectedRevision: accept.expectedRevision });
      return;
    case "narrative-approve":
      return saveThenApprove("/api/dev/translation-narrative", { locale, kind: "article", slug: accept.slug, id: accept.id, sourceVersion: accept.sourceVersion }, accept.expectedRevision, accept.target, (payload) => (payload.entry as { revision: number }).revision, glossaryExceptions);
  }
}

/** Session-only skips: kept for this browser tab, keyed by revision so a changed item returns. */
export const inboxItemKey = (item: InboxItem) => `${item.scope}:${item.id}:${item.revision}`;
const skipStorageKey = (locale: string) => `translation-inbox-skipped:${locale}`;
export function readSkipped(locale: string): Set<string> {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(skipStorageKey(locale)) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}
export function writeSkipped(locale: string, skipped: ReadonlySet<string>): void {
  try {
    window.sessionStorage.setItem(skipStorageKey(locale), JSON.stringify([...skipped]));
  } catch {
    // Storage can be unavailable; skips then last until the view unmounts.
  }
}
