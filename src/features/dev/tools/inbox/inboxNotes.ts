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
