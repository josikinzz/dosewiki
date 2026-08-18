"use client";

import { useSyncExternalStore } from "react";
import { addSharedTheme, canSaveCustomTheme, MAX_CUSTOM_THEMES } from "./customThemes";
import { getPaletteLabTheme, setPaletteLabPreview, updatePaletteLabTheme } from "./paletteLabStore";
import {
  THEME_SHARE_PARAM,
  decodeSharedTheme,
  encodeSharedTheme,
  type ShareSource,
  type SharedTheme,
} from "./themeShareCodec";

/**
 * The receiving half of theme sharing: what happens between a stranger's link
 * and the visitor's own theme collection.
 *
 * Three rules the flow exists to keep:
 *
 * 1. **Nothing applies unseen.** A code — from a link or pasted into the panel
 *    — becomes a *pending* invite. The document previews it so the visitor can
 *    judge the actual look rather than a name, and only an explicit accept
 *    writes anything.
 * 2. **Declining is a true no-op.** The preview lives outside the persisted
 *    envelope, so backing out leaves storage byte-identical to before the link
 *    was opened — including for a visitor who had nothing saved at all.
 * 3. **Accepting is additive.** A shared theme lands as a new slot beside the
 *    visitor's own; no existing slot or preset tweak is overwritten.
 *
 * The pending invite is a module store rather than component state because two
 * unrelated places raise one: the URL, read once on first paint by the always-
 * mounted invite, and the panel's paste field.
 */

/** A share waiting on the visitor's decision: either a decoded theme, or the
 *  reason a code was refused. One shape, because this repo compiles with
 *  `strictNullChecks` off and boolean-tag narrowing is unreliable. */
export type PendingShare = {
  theme: SharedTheme | null;
  error: string | null;
  /** True when it arrived in the URL, so accepting or declining should also
   *  clean the address bar. */
  fromLink: boolean;
};

let pending: PendingShare | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingShare(): PendingShare | null {
  return pending;
}

export function setPendingShare(next: PendingShare | null) {
  if (pending === next) return;
  pending = next;
  // A pending theme previews itself: the point of the step is seeing the look.
  setPaletteLabPreview(
    next?.theme ? { paletteId: next.theme.basePresetId, overrides: next.theme.overrides } : null,
  );
  emit();
}

/** Subscribe the invite surface to whatever share is awaiting a decision. */
export function usePendingShare(): PendingShare | null {
  return useSyncExternalStore(subscribe, getPendingShare, () => null);
}

/* ----------------------------------------------------------------- the link */

/** Read the share code out of the current URL, if there is one. */
export function readShareCodeFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(window.location.href).searchParams.get(THEME_SHARE_PARAM);
  } catch {
    return null;
  }
}

/**
 * Take the code out of the address bar without navigating, so a reload after a
 * decision doesn't ask again and the visitor doesn't carry someone else's theme
 * around in every link they copy.
 */
export function clearShareCodeFromLocation(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(THEME_SHARE_PARAM)) return;
    url.searchParams.delete(THEME_SHARE_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* An exotic history implementation is not worth failing the invite over. */
  }
}

/**
 * The shareable link for a code.
 *
 * Built from the origin the visitor is actually on — never a hard-coded host —
 * so a link minted on the admin host stays on the admin host and nothing here
 * implies the public under-construction domains serve the lab.
 */
export function buildShareLink(code: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/?${THEME_SHARE_PARAM}=${code}`;
}

export function buildShareCode(source: ShareSource): string {
  return encodeSharedTheme(source);
}

/* --------------------------------------------------------------- the decision */

/** Decode a code and raise it as an invite (an undecodable one raises its own
 *  refusal, which is still shown — silence would read as a broken link). */
export function offerSharedThemeCode(code: string, fromLink: boolean): void {
  const { value, error } = decodeSharedTheme(code);
  setPendingShare({ theme: value, error, fromLink });
}

/**
 * Look for a share code in the URL and raise it.
 *
 * The code stays in the address bar until the visitor decides, so a reload
 * mid-thought re-offers it rather than losing the link they were sent. Calling
 * this twice with the same URL just re-offers the same code.
 */
export function consumeShareCodeFromLocation(): void {
  const code = readShareCodeFromLocation();
  if (!code) return;
  offerSharedThemeCode(code, true);
}

/** Whether accepting would actually land — false at the slot cap. */
export function canAcceptSharedTheme(state = getPaletteLabTheme()): boolean {
  return canSaveCustomTheme(state);
}

export { MAX_CUSTOM_THEMES };

/** Once decided, the code comes out of the address bar: the visitor should not
 *  be re-asked on the next reload, nor carry a stranger's theme around in every
 *  URL they copy from here on. */
function settle(share: PendingShare) {
  if (share.fromLink) clearShareCodeFromLocation();
  setPendingShare(null);
}

/**
 * Accept the pending theme: it becomes a new custom slot and the visitor wears
 * it. The preview is dropped first so the slot renders through the ordinary
 * path — the same one a saved theme uses on every later page load.
 */
export function acceptPendingShare(): SharedTheme | null {
  const share = pending;
  if (!share?.theme) return null;
  const theme = share.theme;
  settle(share);
  updatePaletteLabTheme((previous) =>
    addSharedTheme(previous, {
      name: theme.name,
      basePresetId: theme.basePresetId,
      overrides: theme.overrides,
    }),
  );
  return theme;
}

/** Decline: clear the preview and the invite, and change nothing else. */
export function declinePendingShare(): void {
  if (pending) settle(pending);
  else setPendingShare(null);
}
