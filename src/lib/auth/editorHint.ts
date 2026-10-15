export const EDITOR_HINT_STORAGE_KEY = "dosewiki-editor-hint";

export const EDITOR_HINT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function isFreshEditorHint(stored: string | null, now: number = Date.now()): boolean {
  if (stored === null) {
    return false;
  }

  const writtenAt = Number(stored);

  if (!Number.isFinite(writtenAt)) {
    return false;
  }

  const age = now - writtenAt;

  return age >= 0 && age <= EDITOR_HINT_MAX_AGE_MS;
}

export function readEditorHint(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return isFreshEditorHint(window.localStorage.getItem(EDITOR_HINT_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function writeEditorHint(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(EDITOR_HINT_STORAGE_KEY, String(Date.now()));
  } catch {
  }
}

export function clearEditorHint(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(EDITOR_HINT_STORAGE_KEY);
  } catch {
  }
}
