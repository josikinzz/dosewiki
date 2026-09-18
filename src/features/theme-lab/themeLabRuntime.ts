import {
  THEME_LAB_PERSIST_DELAY_MS,
  THEME_LAB_STORAGE_KEY,
  emptyOverrides,
  parseStoredEnvelope,
  readStoredEnvelope,
  serializeEnvelope,
  writeBlurAttribute,
  writeOverrideStyle,
  writeSerializedEnvelope,
} from "./themeLabStorage";
import { effectiveOverrides, userLayerOverrides } from "./themeLabTheme";
import { blurDisabledIn } from "./themeLabStorage";
import { ensureFontFaces } from "./fontFaces";
import { FONT_TOKEN_IDS } from "./paletteTokensFonts";
import {
  getThemeLabTheme,
  resetThemeLabTheme,
  subscribeToThemeLabTheme,
  updateThemeLabTheme,
} from "./themeLabStore";

/**
 * The UI-free half of the Theme Lab: it reads the saved envelope when the tool
 * route mounts, applies it to the document, and owns persistence.
 *
 * The editor panel used to do this, which meant the saved palette only appeared
 * once the panel happened to be opened. Keeping it here means the panel can stay
 * lazily loaded while the saved palette is already on the page behind it.
 *
 * Deliberately framework-free so it can be driven and asserted directly; the
 * `ThemeLabRuntimeMount` component is only a mount point for it — and the one
 * place the *active look* comes from, since the reader's appearance context owns
 * that axis and this module never guesses it.
 */

/** How many mounted runtime components are asking for this. Reference-counted
 *  so a double mount (React StrictMode) doesn't double-register listeners. */
let mountCount = 0;
let unsubscribe: (() => void) | null = null;
let persistTimer: number | null = null;
/** Serialized envelope waiting out the debounce window. */
let pending: string | null = null;
/**
 * The last envelope we tried to write (or just read/adopted). Compared against
 * the current state so cross-tab adoption doesn't echo a write back out, and so
 * a failed write is not retried on a loop.
 */
let lastPersistAttempt: string | null = null;

/**
 * Apply the visitor's edits to the document.
 *
 * One document move for the palette, and it is the whole of the lab's colour
 * contribution: everything under the edits — surface, accent, visual style,
 * colour scheme — is CSS the browser already resolved before this module ran, so
 * there is no base layer here to name or re-assert. Re-applying on every state
 * change is not wasted work: it is what keeps a look switch, a cross-tab
 * adoption and a token edit rendering through exactly the same path, so there is
 * never a frame where two writers disagree.
 */
function applyOverrideStyle() {
  const state = getThemeLabTheme();
  writeOverrideStyle(userLayerOverrides(state));
  // Fonts are the one axis whose value needs something the build did not ship.
  // Read across both schemes, not just the one being worn, so toggling day/night
  // never has to wait for a download.
  //
  // Declaring a face is not fetching one — nothing leaves the network until
  // rendered text actually resolves to it — so this stays free for the visitor
  // who never touches the control.
  const rendering = effectiveOverrides(state);
  ensureFontFaces(FONT_TOKEN_IDS.flatMap((id) => [rendering.dark[id], rendering.light[id]]));
  // Blur cannot be a token substitution (its call sites are hardcoded
  // utilities), so the token's `off` value becomes `html[data-blur="off"]` and
  // one global rule does the disabling.
  writeBlurAttribute(blurDisabledIn(rendering));
}

function flush() {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  const serialized = pending;
  pending = null;
  if (serialized === null) return;
  // Recorded whether or not the write landed: a blocked storage must not send
  // us into a retry loop, and the panel already reports the failure.
  lastPersistAttempt = serialized;
  const ok = writeSerializedEnvelope(serialized);
  updateThemeLabTheme({ storageOk: ok });
}

function schedulePersist(serialized: string) {
  pending = serialized;
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    flush();
  }, THEME_LAB_PERSIST_DELAY_MS);
}

/** Drop an armed write. Used when the state has come back to what storage
 *  already holds, which makes any pending value stale by definition. */
function cancelPendingPersist() {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  pending = null;
}

function onThemeChange() {
  applyOverrideStyle();
  // The look itself is not persisted — the appearance context owns those four
  // axes and saves them under its own keys — so a look switch re-renders and
  // writes nothing, and only a token edit moves the envelope.
  const serialized = serializeEnvelope(getThemeLabTheme());
  if (serialized === lastPersistAttempt) {
    // Nothing to save — but a write may still be armed from an edit made inside
    // this debounce window, and it is now superseded. Cancelling it is the whole
    // point of this branch: leaving the timer alone lands the older value, so a
    // reader who reset a token straight after changing it would watch the edit
    // come back on its own.
    cancelPendingPersist();
    return;
  }
  schedulePersist(serialized);
}

/** Tab close / bfcache freeze: unmount cleanup never runs, so edits made inside
 *  the debounce window would otherwise be lost. */
function onPageHide() {
  flush();
}

/** Backgrounding a tab (especially on mobile, where `pagehide` is unreliable)
 *  is the last moment we are guaranteed to run. */
function onVisibilityChange() {
  if (document.visibilityState === "hidden") flush();
}

/** Another tab saved an edit: adopt it so both tabs wear the same edits and the
 *  last thing the visitor did is what stays saved. */
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== THEME_LAB_STORAGE_KEY) return;
  const envelope = parseStoredEnvelope(event.newValue);
  // Marked as already-persisted *before* the state moves, so the subscriber this
  // update wakes does not echo a foreign write straight back into storage.
  lastPersistAttempt = serializeEnvelope(envelope);
  updateThemeLabTheme({ editsByLook: envelope.editsByLook });
  // A local edit still inside its debounce window loses to the write that just
  // landed: the other tab's save is the more recent statement.
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  pending = null;
  // Explicit because an adoption that changes nothing in the store wakes no
  // subscriber, and the document still has to agree with what was adopted.
  applyOverrideStyle();
}

function hydrate() {
  const { envelope, available, raw } = readStoredEnvelope();
  const serialized = serializeEnvelope(envelope);
  lastPersistAttempt = serialized;
  updateThemeLabTheme({ editsByLook: envelope.editsByLook, storageOk: available });
  // Applied unconditionally: a visitor with no edits changes nothing in the
  // store, and the style still has to be correct.
  applyOverrideStyle();
  // A legacy or otherwise non-canonical blob is rewritten in the current shape,
  // so the migration happens once instead of on every load. A visitor with
  // nothing stored stays unwritten until they actually change something.
  if (raw !== null && raw !== serialized) schedulePersist(serialized);
}

/**
 * Release the runtime and hand the document back unpainted.
 *
 * The lab used to be mounted for the life of the app, so stopping was a
 * theoretical path. Now the tool route owns the mount, and leaving it must take
 * the editor's own layer off the document with it — otherwise a client-side
 * navigation back to a public page would keep wearing an in-progress palette
 * that page never asked for and could not have loaded on its own.
 */
function stop() {
  unsubscribe?.();
  unsubscribe = null;
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("storage", onStorage);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  flush();
  lastPersistAttempt = null;
  writeBlurAttribute(false);
  writeOverrideStyle(emptyOverrides());
  resetThemeLabTheme();
}

/**
 * Start the runtime (idempotent across mounts). Returns the matching stop, which
 * flushes any pending write before releasing.
 */
export function startThemeLabRuntime(): () => void {
  if (typeof window === "undefined") return () => {};

  mountCount += 1;
  if (mountCount === 1) {
    unsubscribe = subscribeToThemeLabTheme(onThemeChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    hydrate();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    mountCount -= 1;
    if (mountCount === 0) stop();
  };
}
