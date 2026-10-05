/**
 * Inbox review notes kept in this browser until the decision they travel with.
 * A note is only written to the decision log when the reviewer resolves,
 * rejects or marks the item as spam, so a draft has nowhere on the server to
 * live. Keeping it here means switching tools, reloading or closing the tab
 * loses nothing, and the shell has no unsaved work to ask about.
 *
 * Keyed by the signed-in reviewer so a shared browser never shows one admin's
 * drafts to another. Storage failures (private mode, quota) fall back to
 * in-memory notes, which the shell then guards as unsaved work; they never
 * block a decision.
 */
const STORAGE_PREFIX = "dosewiki:inbox-notes:v1:";

export type InboxNotes = Record<string, string>;

function storageKey(actor: string | null): string | null {
  return actor ? `${STORAGE_PREFIX}${actor.toLowerCase()}` : null;
}

export function readInboxNotes(actor: string | null): InboxNotes {
  const key = storageKey(actor);
  if (!key || typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== ""),
    );
  } catch {
    return {};
  }
}

/** Whether the notes are now kept. `false` means they live only in memory. */
export function writeInboxNotes(actor: string | null, notes: InboxNotes): boolean {
  const key = storageKey(actor);
  if (!key || typeof window === "undefined") return false;
  const kept = Object.fromEntries(Object.entries(notes).filter(([, value]) => value.trim() !== ""));
  try {
    if (Object.keys(kept).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}
