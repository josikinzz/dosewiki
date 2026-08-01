import {
  PALETTE_LAB_PERSIST_DELAY_MS,
  PALETTE_LAB_STORAGE_KEY,
  THEME_SHARE_FORMAT,
  parseStoredEnvelope,
  readStoredEnvelope,
  serializeEnvelope,
  writeBlurAttribute,
  writeOverrideStyle,
  writePaletteAttribute,
  writeSerializedEnvelope,
  type StoredEnvelopeV3,
} from "./paletteLabStorage";
import { activePaletteId, effectiveOverrides, userLayerOverrides } from "./paletteLabTheme";
import { blurDisabledIn } from "./flatnessAxes";
import { ensureFontFaces } from "./fontFaces";
import { FONT_TOKEN_IDS } from "./paletteTokensFonts";
import {
  getPaletteLabTheme,
  resetPaletteLabTheme,
  subscribeToPaletteLabTheme,
  updatePaletteLabTheme,
} from "./paletteLabStore";

/**
 * The always-on half of the Theme Lab: it reads the saved envelope on page
 * load, applies it to the document, and owns persistence — with no UI at all.
 *
 * The editor panel used to do this, which meant a returning visitor saw the
 * stock site until they happened to open the panel (and never on routes with no
 * trigger). Keeping it here means the panel can stay lazily loaded while a saved
 * theme still applies on every load, on every route, after a hard refresh.
 *
 * Deliberately framework-free so it can be driven and asserted directly; the
 * `PaletteLabRuntime` component is only a mount point for it.
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

function envelopeFor(): StoredEnvelopeV3 {
  const { activeThemeRef, editsByPreset, customThemes } = getPaletteLabTheme();
  return {
    version: 3,
    activeThemeRef,
    editsByPreset,
    customThemes,
    shareFormat: THEME_SHARE_FORMAT,
  };
}

/**
 * What actually renders, in the same two moves the pre-paint bootstrap already
 * made: name the shipped preset (its block is compiled into the stylesheet) and
 * inject the visitor's own layer over it.
 *
 * Re-applying the bootstrap's result is not wasted work — it is what keeps a
 * theme switch, a cross-tab adoption, or a token edit rendering through exactly
 * the same path as the first paint, so there is nothing for hydration to
 * correct and no frame where the two disagree.
 */
function applyOverrideStyle() {
  const state = getPaletteLabTheme();
  // A preview (a shared theme being weighed up) renders in place of the saved
  // look and nothing else changes — no envelope field moves, so the persistence
  // below sees an unchanged envelope and writes nothing. Declining restores the
  // saved look by clearing the preview and coming straight back through here.
  const preview = state.preview;
  writePaletteAttribute(preview ? preview.paletteId : activePaletteId(state));
  writeOverrideStyle(preview ? preview.overrides : userLayerOverrides(state));
  // Fonts are the one axis whose value needs something the build did not ship.
  // Read from the *effective* look (preset layer included, both themes) rather
  // than from the injected layer, so a face named by a shipped preset is
  // registered too, and toggling dark/light never has to wait for a download.
  //
  // Declaring a face is not fetching one — nothing leaves the network until
  // rendered text actually resolves to it — so this stays free for the visitor
  // who never touches the control.
  const rendering = preview ? preview.overrides : effectiveOverrides(state);
  ensureFontFaces(
    FONT_TOKEN_IDS.flatMap((id) => [rendering.dark[id], rendering.light[id]]),
  );
  // Blur cannot be a token substitution (its call sites are hardcoded
  // utilities), so the token's `off` value becomes `html[data-blur="off"]` and
  // one global rule does the disabling. Read from the effective look so a
  // preset or shared preview that flattens blur applies it too.
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
  updatePaletteLabTheme({ storageOk: ok });
}

function schedulePersist(serialized: string) {
  pending = serialized;
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    flush();
  }, PALETTE_LAB_PERSIST_DELAY_MS);
}

function onThemeChange() {
  applyOverrideStyle();
  const serialized = serializeEnvelope(envelopeFor());
  if (serialized === lastPersistAttempt) return;
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

/** Another tab saved a theme: adopt it so both tabs wear the same look and the
 *  last thing the visitor did is what stays saved. */
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== PALETTE_LAB_STORAGE_KEY) return;
  if (event.newValue == null) return;
  const envelope = parseStoredEnvelope(event.newValue);
  // Marked as already-persisted so adopting a foreign write doesn't echo it
  // straight back into storage.
  lastPersistAttempt = serializeEnvelope(envelope);
  updatePaletteLabTheme({
    activeThemeRef: envelope.activeThemeRef,
    editsByPreset: envelope.editsByPreset,
    customThemes: envelope.customThemes,
  });
  applyOverrideStyle();
}

function hydrate() {
  const { envelope, available, raw } = readStoredEnvelope();
  const serialized = serializeEnvelope(envelope);
  lastPersistAttempt = serialized;
  updatePaletteLabTheme({
    activeThemeRef: envelope.activeThemeRef,
    editsByPreset: envelope.editsByPreset,
    customThemes: envelope.customThemes,
    storageOk: available,
  });
  // Applied unconditionally: a visitor sitting on the default preset with no
  // edits changes nothing in the store, and the style still has to be correct.
  applyOverrideStyle();
  // A legacy (v1) or otherwise non-canonical blob is rewritten in the current
  // shape, so the migration happens once instead of on every load. A visitor
  // with nothing stored stays unwritten until they actually change something.
  if (raw !== null && raw !== serialized) schedulePersist(serialized);
}

function stop() {
  unsubscribe?.();
  unsubscribe = null;
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("storage", onStorage);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  flush();
  lastPersistAttempt = null;
  resetPaletteLabTheme();
}

/**
 * Start the runtime (idempotent across mounts). Returns the matching stop, which
 * flushes any pending write before releasing.
 */
export function startPaletteLabRuntime(): () => void {
  if (typeof window === "undefined") return () => {};

  mountCount += 1;
  if (mountCount === 1) {
    unsubscribe = subscribeToPaletteLabTheme(onThemeChange);
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
