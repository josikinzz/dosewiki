export const GESTURE_HINT_STORAGE_KEY = "replication-viewer-gesture-hint";

export function shouldShowGestureHint(
  stored: string | null,
  coarsePointer: boolean,
): boolean {
  return coarsePointer && stored === null;
}

export const VIEWER_SOUND_STORAGE_KEY = "replication-viewer-sound";

export function resolveViewerMuted(stored: string | null): boolean {
  return stored !== "on";
}

export const VIEWER_ROTATE_STORAGE_KEY = "replication-viewer-rotate";

export function resolveViewerRotateMode(stored: string | null): boolean {
  return stored === "on";
}
