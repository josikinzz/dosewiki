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

let mountCount = 0;
let unsubscribe: (() => void) | null = null;
let persistTimer: number | null = null;
let pending: string | null = null;
let lastPersistAttempt: string | null = null;

function applyOverrideStyle() {
  const state = getThemeLabTheme();
  writeOverrideStyle(userLayerOverrides(state));
  const rendering = effectiveOverrides(state);
  ensureFontFaces(FONT_TOKEN_IDS.flatMap((id) => [rendering.dark[id], rendering.light[id]]));
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

function cancelPendingPersist() {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  pending = null;
}

function onThemeChange() {
  applyOverrideStyle();
  const serialized = serializeEnvelope(getThemeLabTheme());
  if (serialized === lastPersistAttempt) {
    cancelPendingPersist();
    return;
  }
  schedulePersist(serialized);
}

function onPageHide() {
  flush();
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") flush();
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== THEME_LAB_STORAGE_KEY) return;
  const envelope = parseStoredEnvelope(event.newValue);
  lastPersistAttempt = serializeEnvelope(envelope);
  updateThemeLabTheme({ editsByLook: envelope.editsByLook });
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  pending = null;
  applyOverrideStyle();
}

function hydrate() {
  const { envelope, available, raw } = readStoredEnvelope();
  const serialized = serializeEnvelope(envelope);
  lastPersistAttempt = serialized;
  updateThemeLabTheme({ editsByLook: envelope.editsByLook, storageOk: available });
  applyOverrideStyle();
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
  writeBlurAttribute(false);
  writeOverrideStyle(emptyOverrides());
  resetThemeLabTheme();
}

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
