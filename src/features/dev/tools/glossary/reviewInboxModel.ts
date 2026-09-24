/**
 * Review Inbox client calls. Reading is the inbox route; Accept dispatches to
 * the existing workbench mutation each item names, at the revision it showed.
 */
import type { InboxAccept, InboxItem, InboxResponse } from "@lib/translation/reviewInboxTypes";
import { confirmTerms } from "./glossaryModel";
import { translationRequest } from "./TranslationHistory";

export const INBOX_ACCEPT_REASON = "Accepted from the Inbox";

export async function fetchInbox(locale: string, offset = 0): Promise<InboxResponse> {
  return translationRequest<InboxResponse>(`/api/dev/translation-inbox?${new URLSearchParams({ locale, offset: String(offset) })}`);
}

/** Save the shown wording as the human draft, then approve exactly the revision that save produced. */
async function saveThenApprove(url: string, base: Record<string, unknown>, expectedRevision: number, target: string, revisionOf: (payload: Record<string, unknown>) => number): Promise<void> {
  const saved = await translationRequest<Record<string, unknown>>(url, { ...base, action: "save", expectedRevision, target, reason: INBOX_ACCEPT_REASON });
  await translationRequest(url, { ...base, action: "approve", expectedRevision: revisionOf(saved), reason: INBOX_ACCEPT_REASON });
}

export async function acceptInboxItem(locale: string, accept: InboxAccept): Promise<void> {
  switch (accept.kind) {
    case "glossary-confirm":
      await confirmTerms(locale, [accept.term], { [accept.term]: accept.expectedRevision });
      return;
    case "ui-approve":
      return saveThenApprove("/api/dev/translation-workbench", { locale, id: accept.id }, accept.expectedRevision, accept.target, (payload) => (payload.row as { revision: number }).revision);
    case "narrative-approve":
      return saveThenApprove("/api/dev/translation-narrative", { locale, kind: "article", slug: accept.slug, id: accept.id, sourceVersion: accept.sourceVersion }, accept.expectedRevision, accept.target, (payload) => (payload.entry as { revision: number }).revision);
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
