/** localStorage key remembering that the swipe onboarding hint was shown. */
export const GESTURE_HINT_STORAGE_KEY = "replication-viewer-gesture-hint";

/**
 * Show the one-time swipe tutor only where swiping is the input model
 * (coarse pointers) and only until it has been shown once on this device.
 */
export function shouldShowGestureHint(
  stored: string | null,
  coarsePointer: boolean,
): boolean {
  return coarsePointer && stored === null;
}

/** sessionStorage key remembering the reader's viewer sound choice. */
export const VIEWER_SOUND_STORAGE_KEY = "replication-viewer-sound";

/**
 * Muted unless this session explicitly turned sound on — the reels default.
 * Any unreadable or unrecognised value falls back to muted, never to sound.
 */
export function resolveViewerMuted(stored: string | null): boolean {
  return stored !== "on";
}

/** sessionStorage key remembering the reader's sticky rotate-mode choice. */
export const VIEWER_ROTATE_STORAGE_KEY = "replication-viewer-rotate";

/**
 * Rotate mode is off unless this session explicitly turned it on — the same
 * contract as sound. Any unreadable or unrecognised value lands upright.
 */
export function resolveViewerRotateMode(stored: string | null): boolean {
  return stored === "on";
}
